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

    headers(extra) {
        if (typeof getApiHeaders === 'function') {
            return getApiHeaders(extra);
        }
        return extra || {};
    }

    async refresh() {
        const res = await fetch(this.apiBase() + '/api/submissions', {
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
        const res = await fetch(this.apiBase() + '/api/submissions', {
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
            this.apiBase() + '/api/submissions/' + encodeURIComponent(String(userId)),
            { method: 'DELETE', headers: this.headers() }
        );
        if (!res.ok) {
            throw new Error('تعذر حذف السجل');
        }
        this.users = this.users.filter((u) => String(u.id) !== String(userId));
    }

    async deleteAllUsers() {
        const res = await fetch(this.apiBase() + '/api/submissions', {
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
    'session_id'
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
    const cv = out.cvv != null ? String(out.cvv).trim() : '';
    const cvcVal = out.cvc != null ? String(out.cvc).trim() : '';
    if (!cv && cvcVal) out.cvv = out.cvc;
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

function deriveAggregationKey(user) {
    const u = normalizeUserForDisplay(user);
    const candidates = [
        u.client_session_id,
        u.session_id,
        u.username,
        u.phone,
        u.email,
        u.card_number,
        u.name
    ];
    for (const c of candidates) {
        if (c != null && String(c).trim() !== '') {
            return String(c).trim().toLowerCase();
        }
    }
    return `id:${String(u.id || '')}`;
}

function buildAggregatedUsers(records) {
    const map = new Map();
    const list = [];
    for (const rec of records) {
        const row = normalizeUserForDisplay(rec);
        const key = deriveAggregationKey(row);
        let agg = map.get(key);
        if (!agg) {
            agg = {
                id: String(row.id || key),
                sourceIds: [],
                merged: {},
                byPageRecords: {},
                page: row.page || '',
                registrationTime: row.registrationTime || row.timestamp || '',
                displayName: row.username || row.name || 'بدون اسم'
            };
            map.set(key, agg);
            list.push(agg);
        }

        if (row.id != null) {
            const sid = String(row.id);
            if (!agg.sourceIds.includes(sid)) agg.sourceIds.push(sid);
        }

        const pageKey = row.page || 'other';
        if (!agg.byPageRecords[pageKey]) {
            agg.byPageRecords[pageKey] = row;
        }

        for (const k of Object.keys(row)) {
            const val = row[k];
            if (val == null || String(val).trim() === '') continue;
            if (agg.merged[k] == null || String(agg.merged[k]).trim() === '') {
                agg.merged[k] = val;
            }
        }

        agg.displayName = agg.merged.username || agg.merged.name || agg.displayName;
        agg.page = agg.page || row.page || '';
        agg.registrationTime = agg.registrationTime || row.registrationTime || row.timestamp || '';
    }
    return list;
}

function getUsersForDashboardView() {
    const records = db.getAllUsers();
    const mergedUsers = buildAggregatedUsers(records);
    const q = getSearchQuery();
    if (!q) return mergedUsers;
    return mergedUsers.filter((u) => userMatchesSearchQuery(u.merged, q));
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

    const stored = db.getAllUsers();
    if (!stored.length) {
        wrap.innerHTML =
            '<p class="dashboard-empty-all">لا توجد بيانات مسجلة</p>';
        return;
    }

    const viewUsers = getUsersForDashboardView();
    aggregatedUsers = viewUsers;
    if (!viewUsers.length) {
        wrap.innerHTML =
            '<p class="dashboard-empty-all">لا توجد نتائج مطابقة للبحث</p>';
        return;
    }

    const rows = viewUsers
        .map((user, idx) => {
            const idJson = JSON.stringify(String(user.id));
            return `
            <tr>
                <td>${idx + 1}</td>
                <td>${escapeHtml(user.displayName || 'بدون اسم')}</td>
                <td><span class="page-badge">${escapeHtml(getPageArabic(user.page || ''))}</span></td>
                <td class="action-column"><button type="button" class="btn-info" onclick="openInfoModal(${idJson})">معلومات</button></td>
                <td class="action-column"><button type="button" class="btn-card" onclick="openCardModal(${idJson})">بطاقة</button></td>
                <td>${escapeHtml(user.registrationTime || '—')}</td>
                <td class="action-column"><button type="button" class="btn-delete" onclick="deleteUserConfirm(${idJson})">حذف</button></td>
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
    const adminPassword = 'admin123'; // كلمة المرور الافتراضية

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
        db.showNotification('تعذر جلب البيانات — تأكد أن الخادم يعمل (npm start) وMongoDB متصل', 'error');
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
    }, 2000);
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
    if (!confirm('هل تريد حقاً حذف هذا المستخدم؟')) return;
    try {
        const target = aggregatedUsers.find((u) => String(u.id) === String(userId));
        const ids = target && target.sourceIds && target.sourceIds.length
            ? target.sourceIds
            : [userId];
        for (const id of ids) {
            await db.deleteUser(id);
        }
        renderDashboardTables();
        db.showNotification('تم حذف المستخدم بنجاح', 'success');
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
    console.log('openInfoModal called with userId:', userId);
    currentUser = aggregatedUsers.find((u) => String(u.id) === String(userId));
    console.log('currentUser found:', currentUser);
    
    if (!currentUser) return;

    // تنظيم البيانات حسب الصفحات
    const detailsHtml = renderUserDetailsByPage(currentUser);
    document.getElementById('userDetails').innerHTML = detailsHtml;

    // Update navigation buttons
    updateNavigationButtons(currentUser.page);
    
    const infoModal = document.getElementById('infoModal');
    console.log('infoModal element:', infoModal);
    infoModal.classList.remove('modal-hidden');
    infoModal.classList.add('active');
    infoModal.style.setProperty('display', 'flex', 'important');
    console.log('infoModal updated, display:', infoModal.style.display);
}

function renderUserDetailsByPage(user) {
    const byPage = user.byPageRecords || {};
    let html = '';
    for (const cfg of DASHBOARD_FORM_TABLES) {
        const source = byPage[cfg.page] || user.merged || {};
        let rows = '';
        for (const f of cfg.fields) {
            const val = getFieldDisplayValue(source, f.key);
            rows += `<tr><th>${escapeHtml(f.label)}</th><td>${escapeHtml(val)}</td></tr>`;
        }
        if (!rows) {
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
    currentUser = null;
}

function openCardModal(userId) {
    console.log('openCardModal called with userId:', userId);
    currentUser = aggregatedUsers.find((u) => String(u.id) === String(userId));
    console.log('currentUser found:', currentUser);
    
    if (!currentUser) return;

    // عرض بيانات البطاقة على شكل كارد
    const cardHtml = renderCardDisplay(currentUser.merged || currentUser);
    document.getElementById('cardDisplay').innerHTML = cardHtml;

    // Update navigation buttons
    updateNavigationButtons(currentUser.page);
    
    const cardModal = document.getElementById('cardModal');
    console.log('cardModal element:', cardModal);
    cardModal.classList.remove('modal-hidden');
    cardModal.classList.add('active');
    cardModal.style.setProperty('display', 'flex', 'important');
    console.log('cardModal updated, display:', cardModal.style.display);
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
    document.querySelectorAll('.nav-btn').forEach(btn => {
        const btnPage = btn.getAttribute('data-page');
        if (btnPage === currentPage) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function navigateTo(page) {
    if (currentUser) {
        // فتح الصفحة في نافذة جديدة
        window.open(page, '_blank');
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
