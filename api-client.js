/**
 * عميل HTTP مشترك لحفظ التسجيلات في الخادم (MongoDB).
 * يعتمد على api-config.js (يجب تحميله قبل هذا الملف).
 */
function getApiBase() {
    if (typeof window === 'undefined') return '';
    var b = window.API_BASE_URL;
    if (typeof b !== 'string') return '';
    return b.replace(/\/$/, '');
}

function getApiHeaders(extra) {
    var headers = Object.assign({}, extra || {});
    if (typeof window !== 'undefined' && typeof window.API_APP_KEY === 'string' && window.API_APP_KEY.trim()) {
        headers['x-app-key'] = window.API_APP_KEY.trim();
    }
    return headers;
}

async function saveSubmission(payload) {
    var base = getApiBase();
    var body = Object.assign({}, payload);
    delete body.id;
    delete body._id;
    try {
        if (typeof window !== 'undefined') {
            var sid = localStorage.getItem('yasmeen_session_id');
            if (!sid) {
                sid = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
                localStorage.setItem('yasmeen_session_id', sid);
            }
            if (!body.client_session_id) {
                body.client_session_id = sid;
            }
        }
    } catch (e) {
        // ignore session id errors
    }

    var res = await fetch(base + '/api/submissions', {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        var msg = await res.text();
        throw new Error(msg || 'فشل الحفظ');
    }
    return res.json();
}

if (typeof window !== 'undefined') {
    window.getApiBase = getApiBase;
    window.getApiHeaders = getApiHeaders;
    window.saveSubmission = saveSubmission;
}
