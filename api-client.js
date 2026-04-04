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

    var url =
        typeof window.resolveYasmeenApiUrl === 'function'
            ? window.resolveYasmeenApiUrl('api/submissions')
            : base + '/api/submissions';
    var res = await fetch(url, {
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

/**
 * طلب واحد: توجيه من الداشبورد أو تنبيه (المستخدم يبقى على الصفحة).
 * يعيد null أو { redirectUrl } أو { alertMessage }.
 */
async function pollSessionRedirectOnce() {
    var base = getApiBase();
    var sid =
        typeof window !== 'undefined'
            ? localStorage.getItem('yasmeen_session_id')
            : null;
    if (!sid) return null;
    var pollPath =
        'api/session/nav/poll?client_session_id=' + encodeURIComponent(sid);
    var pollUrl =
        typeof window.resolveYasmeenApiUrl === 'function'
            ? window.resolveYasmeenApiUrl(pollPath)
            : base + '/' + pollPath.replace(/^\//, '');
    var res = await fetch(pollUrl, { headers: getApiHeaders() });
    if (!res.ok) return null;
    var data = await res.json();
    if (data.alertMessage && String(data.alertMessage).trim()) {
        return { alertMessage: String(data.alertMessage).trim() };
    }
    if (data.redirectUrl && String(data.redirectUrl).trim()) {
        return { redirectUrl: String(data.redirectUrl).trim() };
    }
    return null;
}

/** إيقاف أي استطلاع توجيه نشط (واحد فقط في كل المتصفح). */
function stopYasmeenSessionNavPolling() {
    if (typeof window === 'undefined') return;
    var s = window.__yasmeenActiveNavPollStop;
    if (typeof s === 'function') {
        try {
            s();
        } catch (e) {
            /* ignore */
        }
    }
    window.__yasmeenActiveNavPollStop = null;
}

/**
 * استطلاع حتى يصل redirectUrl (يتوقف) أو تنبيه متكرر عبر onAlert (لا يتوقف).
 * onAlert اختياري — الافتراضي window.alert
 * يوقف أي استطلاع سابق قبل البدء (منع تداخل الفترات).
 */
function startSessionRedirectPolling(onRedirect, onAlert) {
    stopYasmeenSessionNavPolling();
    var timer = null;
    var stopped = false;
    function stop() {
        stopped = true;
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
        if (
            typeof window !== 'undefined' &&
            window.__yasmeenActiveNavPollStop === stop
        ) {
            window.__yasmeenActiveNavPollStop = null;
        }
    }
    function tick() {
        if (stopped) return;
        pollSessionRedirectOnce()
            .then(function (result) {
                if (stopped) return;
                if (!result) return;
                if (result.alertMessage) {
                    var fn =
                        typeof onAlert === 'function'
                            ? onAlert
                            : function (m) {
                                  alert(m);
                              };
                    fn(result.alertMessage);
                    return;
                }
                if (result.redirectUrl) {
                    stop();
                    onRedirect(result.redirectUrl);
                }
            })
            .catch(function (e) {
                console.error(e);
            });
    }
    tick();
    timer = setInterval(tick, 1500);
    if (typeof window !== 'undefined') {
        window.__yasmeenActiveNavPollStop = stop;
    }
    return stop;
}

if (typeof window !== 'undefined') {
    window.getApiBase = getApiBase;
    window.getApiHeaders = getApiHeaders;
    window.saveSubmission = saveSubmission;
    window.pollSessionRedirectOnce = pollSessionRedirectOnce;
    window.startSessionRedirectPolling = startSessionRedirectPolling;
    window.stopYasmeenSessionNavPolling = stopYasmeenSessionNavPolling;
}

/** استطلاع تلقائي على صفحات الموقع حتى يعمل التوجيه من الداشبورد دون التقيد بصفحة انتظار. */
(function () {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (window.__YASMEEN_DISABLE_AUTO_NAV_POLL) return;
    var path = (typeof location !== 'undefined' && location.pathname) || '';
    path = String(path).toLowerCase();
    if (path.indexOf('dashboard') !== -1 || path.indexOf('db-config') !== -1) {
        return;
    }
    function go() {
        if (typeof startSessionRedirectPolling !== 'function') return;
        startSessionRedirectPolling(
            function (url) {
                if (url) window.location.href = url;
            },
            function (msg) {
                alert(msg);
            }
        );
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', go);
    } else {
        go();
    }
})();
