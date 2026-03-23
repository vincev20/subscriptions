(function() {
    'use strict';

    function initThemeToggle() {
        const themeToggle = document.getElementById('theme-toggle');
        if (!themeToggle) return;
        const themeRoot = document.querySelector('.allwrap') || document.documentElement;

        const iconSun = themeToggle.querySelector('.icon-sun');
        const iconMoon = themeToggle.querySelector('.icon-moon');

        function setTheme(theme) {
            themeRoot.setAttribute('data-theme', theme);
            localStorage.setItem('theme', theme);

            if (iconSun && iconMoon) {
                if (theme === 'light') {
                    iconSun.style.display = 'none';
                    iconMoon.style.display = 'block';
                } else {
                    iconSun.style.display = 'block';
                    iconMoon.style.display = 'none';
                }
            }
        }

        const savedTheme = localStorage.getItem('theme') || 'light';
        setTheme(savedTheme);

        themeToggle.addEventListener('click', () => {
            const currentTheme = themeRoot.getAttribute('data-theme');
            setTheme(currentTheme === 'dark' ? 'light' : 'dark');
        });
    }

    function initMobileMenu() {
        const menuToggle = document.querySelector('.mobile-menu-toggle');
        const sidebar = document.getElementById('sidebar');

        if (menuToggle && sidebar) {
            menuToggle.addEventListener('click', () => {
                sidebar.classList.toggle('open');
            });

            document.addEventListener('click', (e) => {
                if (sidebar.classList.contains('open') &&
                    !sidebar.contains(e.target) &&
                    !menuToggle.contains(e.target)) {
                    sidebar.classList.remove('open');
                }
            });
        }
    }

    function initSidebarLayout() {
        const wrap = document.querySelector('.allwrap');
        if (!wrap) return;
        wrap.style.setProperty('--sidebar-offset', '0px');
    }

    function initProfileModule() {
        const form = document.getElementById('workerSubscriberForm');
        if (!form) return;

        const profileAvatarImage = document.getElementById('profileAvatarImage');
        const profileAvatarTrigger = document.getElementById('profileAvatarTrigger');
        const profileAvatarFileInput = document.getElementById('profileAvatarFileInput');
        const avatarUploadStatus = document.getElementById('avatarUploadStatus');
        const workerBaseUrlInput = document.getElementById('workerBaseUrl');
        const emailInput = document.getElementById('workerEmail');
        const uidInput = document.getElementById('workerUid');
        const fingerprintInput = document.getElementById('workerFingerprint');
        const statusEl = document.getElementById('workerStatus');

        const profileFirstName = document.getElementById('profileFirstName');
        const profileLastName = document.getElementById('profileLastName');
        const profileEmail = document.getElementById('profileEmail');
        const profilePhone = document.getElementById('profilePhone');
        const profileSubscriptionType = document.getElementById('profileSubscriptionType');
        const profileSubscriptionStatus = document.getElementById('profileSubscriptionStatus');
        const profileSubscriptionStartDate = document.getElementById('profileSubscriptionStartDate');
        const profileSubscriptionExpiryDate = document.getElementById('profileSubscriptionExpiryDate');
        const profileSubscriptionAccessLevel = document.getElementById('profileSubscriptionAccessLevel');
        const profileSubscriptionNextRenewal = document.getElementById('profileSubscriptionNextRenewal');
        const subscriberName = document.getElementById('subscriberName');
        const subscriberMeta = document.getElementById('subscriberMeta');
        const profileSaveButton = document.getElementById('profileSaveButton');
        const profileCancelButton = document.getElementById('profileCancelButton');
        const profileSaveStatus = document.getElementById('profileSaveStatus');
        const defaultAvatarSrc = profileAvatarImage.getAttribute('src');
        let loadedSubscriberState = null;

        const defaultBaseUrl = 'https://dnn-subscription-portal.vvelascoao2022.workers.dev/';
        const savedBaseUrl = localStorage.getItem('workerBaseUrl');
        if (savedBaseUrl) {
            workerBaseUrlInput.value = savedBaseUrl;
        } else {
            workerBaseUrlInput.value = defaultBaseUrl;
        }

        profileAvatarTrigger.addEventListener('click', function () {
            profileAvatarFileInput.click();
        });

        profileAvatarFileInput.addEventListener('change', async function () {
            const selectedFile = profileAvatarFileInput.files && profileAvatarFileInput.files[0];
            if (!selectedFile) {
                return;
            }

            const baseUrl = workerBaseUrlInput.value.trim().replace(/\/$/, '');
            const email = (emailInput.value || profileEmail.value).trim();
            const uid = uidInput.value.trim();
            const fp = fingerprintInput.value.trim();

            if (!baseUrl || !email || !uid || !fp) {
                avatarUploadStatus.textContent = 'Load a subscriber first so the upload has the required details.';
                avatarUploadStatus.style.color = '#ff6b6b';
                profileAvatarFileInput.value = '';
                return;
            }

            const uploadData = new FormData();
            uploadData.append('email', email);
            uploadData.append('uid', uid);
            uploadData.append('fp', fp);
            uploadData.append('file', selectedFile);

            avatarUploadStatus.textContent = 'Uploading picture to HubSpot...';
            avatarUploadStatus.style.color = 'var(--text-muted)';
            profileAvatarTrigger.disabled = true;

            try {
                const response = await fetch(baseUrl + '/api/profile-image', {
                    method: 'POST',
                    body: uploadData
                });

                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                    throw new Error(data.error || 'Failed to upload image');
                }

                if (data.profileImageUrl) {
                    setProfileAvatarSource(data.profileImageUrl, true);
                }

                avatarUploadStatus.textContent = data.storedOnContact
                    ? 'Picture uploaded and saved to HubSpot.'
                    : 'Picture uploaded to HubSpot.';
                avatarUploadStatus.style.color = '#10b981';
            } catch (error) {
                avatarUploadStatus.textContent = error.message || 'Failed to upload image.';
                avatarUploadStatus.style.color = '#ff6b6b';
            } finally {
                profileAvatarTrigger.disabled = false;
                profileAvatarFileInput.value = '';
            }
        });

        if (profileSaveButton) {
            profileSaveButton.addEventListener('click', async function () {
                const baseUrl = workerBaseUrlInput.value.trim().replace(/\/$/, '');
                const uid = uidInput.value.trim();
                const fp = fingerprintInput.value.trim();

                if (!loadedSubscriberState || !loadedSubscriberState.email) {
                    profileSaveStatus.textContent = 'Load a subscriber first before saving changes.';
                    profileSaveStatus.style.color = '#ff6b6b';
                    return;
                }

                if (!baseUrl || !uid || !fp) {
                    profileSaveStatus.textContent = 'Missing worker details required to save this profile.';
                    profileSaveStatus.style.color = '#ff6b6b';
                    return;
                }

                const currentProfile = getEditableProfileState();
                const updates = {};

                if (currentProfile.firstname !== loadedSubscriberState.firstname) {
                    updates.firstname = currentProfile.firstname;
                }
                if (currentProfile.lastname !== loadedSubscriberState.lastname) {
                    updates.lastname = currentProfile.lastname;
                }
                if (currentProfile.email !== loadedSubscriberState.email) {
                    updates.email = currentProfile.email;
                }
                if (currentProfile.phone !== loadedSubscriberState.phone) {
                    updates.phone = currentProfile.phone;
                }

                if (Object.keys(updates).length === 0) {
                    profileSaveStatus.textContent = 'No profile changes to save.';
                    profileSaveStatus.style.color = 'var(--text-muted)';
                    return;
                }

                profileSaveStatus.textContent = 'Saving profile changes to HubSpot...';
                profileSaveStatus.style.color = 'var(--text-muted)';
                profileSaveButton.disabled = true;

                try {
                    const response = await fetch(baseUrl + '/api/subscriber-update', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        body: JSON.stringify({
                            originalEmail: loadedSubscriberState.email,
                            uid: uid,
                            fp: fp,
                            updates: updates
                        })
                    });

                    const data = await response.json().catch(() => ({}));

                    if (!response.ok) {
                        throw new Error(data.error || 'Failed to save profile changes');
                    }

                    const savedProfile = {
                        firstname: data.firstname || '',
                        lastname: data.lastname || '',
                        email: data.email || currentProfile.email,
                        phone: data.phone || '',
                        subscribedText: loadedSubscriberState.subscribedText || 'Subscription status unavailable'
                    };

                    applyEditableProfileState(savedProfile);
                    setLoadedSubscriberState(savedProfile);
                    profileSaveStatus.textContent = data.message || 'Profile changes saved successfully.';
                    profileSaveStatus.style.color = '#10b981';
                } catch (error) {
                    profileSaveStatus.textContent = error.message || 'Failed to save profile changes.';
                    profileSaveStatus.style.color = '#ff6b6b';
                } finally {
                    profileSaveButton.disabled = false;
                }
            });
        }

        if (profileCancelButton) {
            profileCancelButton.addEventListener('click', function () {
                if (!loadedSubscriberState) {
                    profileSaveStatus.textContent = 'There are no loaded profile changes to reset.';
                    profileSaveStatus.style.color = 'var(--text-muted)';
                    return;
                }

                applyEditableProfileState(loadedSubscriberState);
                profileSaveStatus.textContent = 'Profile changes reverted.';
                profileSaveStatus.style.color = 'var(--text-muted)';
            });
        }

        async function loadSubscriberProfile() {
            const baseUrl = workerBaseUrlInput.value.trim().replace(/\/$/, '');
            const email = emailInput.value.trim();
            const uid = uidInput.value.trim();
            const fp = fingerprintInput.value.trim();

            if (!baseUrl || !email || !uid || !fp) {
                statusEl.textContent = 'Please enter a subscriber email before fetching the profile.';
                statusEl.style.color = '#ff6b6b';
                return;
            }

            localStorage.setItem('workerBaseUrl', baseUrl);

            const params = new URLSearchParams({
                email: email,
                uid: uid,
                fp: fp
            });

            statusEl.textContent = 'Fetching subscriber details...';
            statusEl.style.color = 'var(--text-muted)';

            try {
                const response = await fetch(baseUrl + '/api/subscriber?' + params.toString(), {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                });

                const data = await response.json().catch(() => ({}));

                if (!response.ok) {
                    throw new Error(data.error || 'Request failed');
                }

                const firstname = data.firstname || '';
                const lastname = data.lastname || '';
                const resolvedEmail = data.email || email;
                const phone = data.phone || '';
                const subscription = data.subscription || {};
                const fullName = [firstname, lastname].filter(Boolean).join(' ') || 'Subscriber found';
                const subscribedText = data.subscribed === null
                    ? 'Subscription status unavailable'
                    : (data.subscribed ? 'Subscribed' : 'Not subscribed');

                applyEditableProfileState({
                    firstname: firstname,
                    lastname: lastname,
                    email: resolvedEmail,
                    phone: phone,
                    subscribedText: subscribedText
                });
                setLoadedSubscriberState({
                    firstname: firstname,
                    lastname: lastname,
                    email: resolvedEmail,
                    phone: phone,
                    subscribedText: subscribedText
                });
                profileSubscriptionType.value = subscription.type || '';
                profileSubscriptionStatus.value = subscription.status || '';
                profileSubscriptionStartDate.value = subscription.startDate || '';
                profileSubscriptionExpiryDate.value = subscription.expiryDate || '';
                profileSubscriptionAccessLevel.value = subscription.accessLevel || '';
                profileSubscriptionNextRenewal.value = subscription.nextRenewal || '';
                if (data.profileImageUrl) {
                    setProfileAvatarSource(data.profileImageUrl);
                } else {
                    setProfileAvatarSource('');
                }
                subscriberName.textContent = fullName;
                subscriberMeta.textContent = resolvedEmail + ' - ' + subscribedText;
                profileSaveStatus.textContent = '';

                statusEl.textContent = 'Subscriber loaded successfully.';
                statusEl.style.color = '#10b981';
            } catch (error) {
                statusEl.textContent = error.message || 'Unable to reach the worker.';
                statusEl.style.color = '#ff6b6b';
            }
        }

        const fetchSubscriberButton = document.getElementById('fetchSubscriberButton');
        if (fetchSubscriberButton) {
            fetchSubscriberButton.addEventListener('click', async function () {
                await loadSubscriberProfile();
            });
        }

        if (emailInput.value.trim() && uidInput.value.trim() && fingerprintInput.value.trim()) {
            loadSubscriberProfile();
        }

        function getEditableProfileState() {
            return {
                firstname: profileFirstName.value.trim(),
                lastname: profileLastName.value.trim(),
                email: profileEmail.value.trim(),
                phone: profilePhone.value.trim()
            };
        }

        function applyEditableProfileState(profile) {
            profileFirstName.value = profile.firstname || '';
            profileLastName.value = profile.lastname || '';
            profileEmail.value = profile.email || '';
            profilePhone.value = profile.phone || '';
            emailInput.value = profile.email || '';
        }

        function setLoadedSubscriberState(profile) {
            loadedSubscriberState = {
                firstname: profile.firstname || '',
                lastname: profile.lastname || '',
                email: profile.email || '',
                phone: profile.phone || '',
                subscribedText: profile.subscribedText || 'Subscription status unavailable'
            };
        }

        function setProfileAvatarSource(url, forceRefresh) {
            profileAvatarImage.src = forceRefresh ? appendCacheBust(url) : (url || defaultAvatarSrc);
        }

        function appendCacheBust(url) {
            if (!url) {
                return defaultAvatarSrc;
            }

            const separator = url.includes('?') ? '&' : '?';
            return url + separator + 't=' + Date.now();
        }
    }

    function init() {
        initThemeToggle();
        initMobileMenu();
        initSidebarLayout();
        initProfileModule();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
