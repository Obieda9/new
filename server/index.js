/**
 * خادم Express + MongoDB (Mongoose) لتخزين تسجيلات النماذج وخدمة الداشبورد.
 * شغّل من مجلد server: npm install && npm start
 * ثم افتح الموقع من: http://localhost:3000/ (الملفات الثابتة تُخدم من جذر المشروع)
 */
require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const PORT = process.env.PORT || 3000;
const ADMIN_CONFIG_PASSWORD = process.env.ADMIN_CONFIG_PASSWORD || 'change-me-now';
/** كلمة مرور الداشبورد الافتراضية عند أول تشغيل (يُنصح بتعيين DASHBOARD_ADMIN_PASSWORD في الإنتاج) */
const DASHBOARD_DEFAULT_PASSWORD =
    process.env.DASHBOARD_ADMIN_PASSWORD || 'Mm789789@';
const BOOT_DEFAULT_APP_KEY = process.env.DEFAULT_APP_KEY || 'yasmeen';
const SINGLE_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/yasmeen';

/** دومين/دومينات الواجهة للـ CORS (مثال Render: https://www.example.com أو عدة قيم مفصولة بفاصلة) */
const ENV_PUBLIC_SITE_URL = (process.env.PUBLIC_SITE_URL || process.env.CLIENT_ORIGIN || '')
    .trim();
/** يُحقَن في المتصفح كـ window.API_BASE_URL عند الحاجة (خدمة API منفصلة عن الملفات الثابتة) */
const ENV_PUBLIC_API_URL = (process.env.PUBLIC_API_URL || '').trim().replace(/\/$/, '');

function buildCorsOrigin() {
    if (!ENV_PUBLIC_SITE_URL) return true;
    const list = ENV_PUBLIC_SITE_URL.split(',').map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) return true;
    if (list.length === 1) return list[0];
    return (origin, cb) => {
        if (!origin) return cb(null, true);
        cb(null, list.includes(origin));
    };
}

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
        redirectUrl: { type: String, required: false, default: '' },
        alertMessage: { type: String, required: false, default: '' }
    },
    { timestamps: true, collection: 'session_nav' }
);
sessionNavSchema.index({ client_session_id: 1 }, { unique: true });

const dashboardAuthSchema = new mongoose.Schema(
    {
        singletonKey: { type: String, default: 'default', required: true },
        passwordHash: { type: String, required: true },
        passwordSalt: { type: String, required: true },
        sessionEpoch: { type: Number, default: 0 }
    },
    { timestamps: true, collection: 'dashboard_auth' }
);
dashboardAuthSchema.index({ singletonKey: 1 }, { unique: true });

const connections = new Map();
const models = new Map();

function getAllowedAppKeys() {
    return Object.keys(runtimeUriMap);
}

function getSessionNavModel(conn) {
    if (conn.models.SessionNav) return conn.models.SessionNav;
    return conn.model('SessionNav', sessionNavSchema);
}

function getDashboardAuthModel(conn) {
    if (conn.models.DashboardAuth) return conn.models.DashboardAuth;
    return conn.model('DashboardAuth', dashboardAuthSchema);
}

function hashDashboardPassword(password) {
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(String(password), salt, 64);
    return {
        passwordHash: hash.toString('hex'),
        passwordSalt: salt.toString('hex')
    };
}

function verifyDashboardPassword(password, passwordHashHex, passwordSaltHex) {
    try {
        const salt = Buffer.from(passwordSaltHex, 'hex');
        const expected = Buffer.from(passwordHashHex, 'hex');
        const actual = crypto.scryptSync(String(password), salt, 64);
        if (actual.length !== expected.length) return false;
        return crypto.timingSafeEqual(actual, expected);
    } catch (e) {
        return false;
    }
}

async function getOrCreateDashboardAuthDoc(Model) {
    let doc = await Model.findOne({ singletonKey: 'default' });
    if (!doc) {
        const { passwordHash, passwordSalt } = hashDashboardPassword(
            DASHBOARD_DEFAULT_PASSWORD
        );
        doc = await Model.create({
            singletonKey: 'default',
            passwordHash,
            passwordSalt,
            sessionEpoch: 0
        });
    }
    return doc;
}

async function ensureAppModel(appKey) {
    if (models.has(appKey)) return models.get(appKey);
    const uri = runtimeUriMap[appKey];
    if (!uri) return null;
    const conn = await mongoose.createConnection(uri).asPromise();
    connections.set(appKey, conn);
    const model = conn.model('Submission', submissionSchema);
    getSessionNavModel(conn);
    getDashboardAuthModel(conn);
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
app.set('trust proxy', 1);
app.use(cors({ origin: buildCorsOrigin() }));
app.use(express.json({ limit: '512kb' }));

/**
 * يُستدعى من المتصفح (أحياناً عبر XHR متزامن من api-config.js).
 * يضبط API_BASE_URL من PUBLIC_API_URL أو من عنوان الخادم الحالي (مهم عند فصل الاستضافة الثابتة عن Render).
 */
app.get('/env-api-override.js', (req, res) => {
    res.type('application/javascript; charset=utf-8');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    const forwardedProto = (req.get('x-forwarded-proto') || '').split(',')[0].trim();
    const proto = forwardedProto || req.protocol || 'https';
    const hostRaw = req.get('x-forwarded-host') || req.get('host') || '';
    const host = String(hostRaw).split(',')[0].trim();
    const inferredOrigin = host ? `${proto}://${host}`.replace(/\/$/, '') : '';
    const apiBase = (ENV_PUBLIC_API_URL || inferredOrigin || '').replace(/\/$/, '');
    const site = ENV_PUBLIC_SITE_URL.split(',')[0].trim().replace(/\/$/, '');
    const chunks = ['(function(){'];
    if (apiBase) {
        chunks.push(`window.API_BASE_URL=${JSON.stringify(apiBase)};`);
    }
    if (site) {
        chunks.push(`window.__PUBLIC_SITE_URL__=${JSON.stringify(site)};`);
    }
    chunks.push('})();');
    res.send(chunks.join(''));
});

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

/** جلسة لوحة التحكم: رقم يزيد عند «إخراج كل الأجهزة» لمقارنته محلياً */
app.get('/api/admin/dashboard-auth/epoch', async (req, res) => {
    try {
        const conn = connections.get(req.appKey);
        if (!conn) {
            return res.status(500).json({ error: 'لا اتصال بقاعدة البيانات' });
        }
        const Model = getDashboardAuthModel(conn);
        const doc = await getOrCreateDashboardAuthDoc(Model);
        res.json({ sessionEpoch: doc.sessionEpoch || 0 });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'فشل قراءة جلسة اللوحة' });
    }
});

app.post('/api/admin/dashboard-auth/verify', async (req, res) => {
    try {
        const password = String(req.body.password || '');
        const conn = connections.get(req.appKey);
        if (!conn) {
            return res.status(500).json({ error: 'لا اتصال بقاعدة البيانات' });
        }
        const Model = getDashboardAuthModel(conn);
        const doc = await getOrCreateDashboardAuthDoc(Model);
        if (
            !verifyDashboardPassword(
                password,
                doc.passwordHash,
                doc.passwordSalt
            )
        ) {
            return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
        }
        res.json({ ok: true, sessionEpoch: doc.sessionEpoch || 0 });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'فشل التحقق' });
    }
});

app.post('/api/admin/dashboard-auth/change-password', async (req, res) => {
    try {
        const oldPassword = String(req.body.oldPassword || '');
        const newPassword = String(req.body.newPassword || '');
        const revokeAllSessions = !!req.body.revokeAllSessions;
        if (newPassword.length < 6) {
            return res.status(400).json({
                error: 'كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف'
            });
        }
        const conn = connections.get(req.appKey);
        if (!conn) {
            return res.status(500).json({ error: 'لا اتصال بقاعدة البيانات' });
        }
        const Model = getDashboardAuthModel(conn);
        const doc = await getOrCreateDashboardAuthDoc(Model);
        if (
            !verifyDashboardPassword(
                oldPassword,
                doc.passwordHash,
                doc.passwordSalt
            )
        ) {
            return res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة' });
        }
        const { passwordHash, passwordSalt } = hashDashboardPassword(newPassword);
        let sessionEpoch = doc.sessionEpoch || 0;
        if (revokeAllSessions) {
            sessionEpoch += 1;
        }
        await Model.updateOne(
            { _id: doc._id },
            { $set: { passwordHash, passwordSalt, sessionEpoch } }
        );
        res.json({ ok: true, sessionEpoch });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'فشل تغيير كلمة المرور' });
    }
});

/** انتظار المشرف: توجيه لمستخدم أو إرسال تنبيه (يبقى على نفس الصفحة) */
app.post('/api/session/nav', async (req, res) => {
    try {
        if (!req.SessionNav) {
            return res.status(500).json({ error: 'تعذر تهيئة نموذج التوجيه' });
        }
        const client_session_id = String(req.body.client_session_id || '').trim();
        const redirectUrl = String(req.body.redirectUrl || req.body.url || '').trim();
        const alertMessage = String(req.body.alertMessage || '').trim();
        if (!client_session_id) {
            return res.status(400).json({ error: 'client_session_id مطلوب' });
        }
        if (alertMessage && redirectUrl) {
            return res.status(400).json({
                error: 'أرسل إما redirectUrl للتوجيه أو alertMessage للتنبيه وليس الاثنين معاً'
            });
        }
        if (!alertMessage && !redirectUrl) {
            return res.status(400).json({
                error: 'مطلوب redirectUrl أو alertMessage'
            });
        }
        if (alertMessage) {
            await req.SessionNav.findOneAndUpdate(
                { client_session_id },
                {
                    $set: { client_session_id, alertMessage },
                    $unset: { redirectUrl: '' }
                },
                { upsert: true }
            );
        } else {
            await req.SessionNav.findOneAndUpdate(
                { client_session_id },
                {
                    $set: { client_session_id, redirectUrl },
                    $unset: { alertMessage: '' }
                },
                { upsert: true }
            );
        }
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
        const am = doc.alertMessage && String(doc.alertMessage).trim();
        if (am) {
            return res.json({ alertMessage: am });
        }
        const ru = doc.redirectUrl && String(doc.redirectUrl).trim();
        if (ru) {
            return res.json({ redirectUrl: ru });
        }
        return res.json({});
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
        if (ENV_PUBLIC_SITE_URL) {
            console.log(`PUBLIC_SITE_URL (CORS): ${ENV_PUBLIC_SITE_URL}`);
        }
        if (ENV_PUBLIC_API_URL) {
            console.log(`PUBLIC_API_URL → يُحقَن للمتصفح عبر /env-api-override.js`);
        }
    });
}

start();
