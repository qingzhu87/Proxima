// --- STATE ---
let state = {
    profiles: [],
    activeProfileId: null,
};

// --- DOM ELEMENTS ---
const elements = {
    profileList: document.getElementById('profile-list'),
    optionsBtn: document.getElementById('options-btn'),
    container: document.querySelector('.container')
};

// 初始隐藏内容，直到连接成功
if (elements.container) {
    elements.container.style.opacity = '0';
    elements.container.style.transition = 'opacity 0.3s ease';
}

// 建立与 background 的连接
let port;
function connectToBackground() {
    try {
        port = chrome.runtime.connect({ name: 'popup' });
        console.log('与 background 建立连接');
        return true;
    } catch (error) {
        console.error('连接 background 失败:', error);
        return false;
    }
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // 先隐藏界面，等连接成功后再显示
    initialize(true);
});

async function initialize(isFirstAttempt = false) {
    addEventListeners();
    
    // 尝试建立连接
    if (isFirstAttempt) {
        connectToBackground();
    }
    
    try {
        const appState = await chrome.runtime.sendMessage({ type: 'GET_APP_STATE' });
        if (appState) {
            state = appState;
            render();
            // 连接成功，显示界面
            if (elements.container) {
                elements.container.style.opacity = '1';
            }
        } else {
            // 如果是首次尝试，自动重试一次
            if (isFirstAttempt) {
                console.log("首次连接未获取到状态，自动重试中...");
                setTimeout(() => initialize(false), 300);
            } else {
                console.warn("重试后仍未获取到状态，显示重试按钮");
                showRetryUI();
            }
        }
    } catch (error) {
        console.error("连接错误:", error);
        
        // 如果是首次尝试，自动重试一次
        if (isFirstAttempt) {
            console.log("首次连接失败，自动重试中...");
            setTimeout(() => initialize(false), 300);
        } else {
            console.warn("重试后仍连接失败，显示重试按钮");
            showRetryUI();
        }
    }
}

// 显示重试界面
function showRetryUI() {
    if (elements.container) {
        elements.container.style.opacity = '1';
    }
    
    if (elements.profileList) {
        elements.profileList.innerHTML = `
            <li class="error-message">
                <div>连接失败，请重试</div>
                <button id="retry-btn" class="retry-button">重试</button>
            </li>
        `;
        
        document.getElementById('retry-btn')?.addEventListener('click', () => {
            elements.profileList.innerHTML = '<li>重新连接中...</li>';
            connectToBackground(); // 重新尝试建立连接
            setTimeout(() => initialize(false), 100);
        });
    }
}

// --- RENDERING ---
function render() {
    if (!elements.profileList) return;

    elements.profileList.innerHTML = ''; // Clear existing list

    state.profiles.forEach(profile => {
        const item = createProfileItem(profile);
        elements.profileList.appendChild(item);
    });
}

function createProfileItem(profile) {
    const item = document.createElement('li');
    item.className = 'profile-item';
    item.dataset.profileId = profile.id;

    if (profile.id === state.activeProfileId) {
        item.classList.add('active');
    }
    
    const icon = getProfileIcon(profile);
    const details = getProfileDetails(profile);

    item.innerHTML = `
        <div class="profile-icon">${icon}</div>
        <div class="profile-info">
            <div class="profile-name">${profile.name}</div>
            <div class="profile-details">${details}</div>
        </div>
    `;

    return item;
}

function getProfileIcon(profile) {
    switch (profile.type) {
        case 'direct': return '🌐'; // Globe icon
        case 'system': return '🖥️'; // Desktop computer icon
        case 'proxy': return '⚡'; // Lightning bolt icon
        default: return '●';
    }
}

function getProfileDetails(profile) {
    switch (profile.type) {
        case 'proxy':
            // Check if proxy details exist to avoid "undefined:undefined"
            if (profile.proxy && profile.proxy.host && profile.proxy.port) {
                return `${profile.proxy.host}:${profile.proxy.port}`;
            }
            return 'Not configured';
        case 'direct':
            return 'All connections will be direct.';
        case 'system':
            return 'Using system proxy settings.';
        default:
            return '';
    }
}

// --- EVENT HANDLING ---
function addEventListeners() {
    elements.optionsBtn.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    elements.profileList.addEventListener('click', (event) => {
        const target = event.target.closest('.profile-item');
        if (target && target.dataset.profileId) {
            handleProfileSelect(target.dataset.profileId);
        }
    });
}

function handleProfileSelect(profileId) {
    // Optimistically update the UI for instant feedback
    state.activeProfileId = profileId;
    render();

    // Tell the background script to apply the change
    chrome.runtime.sendMessage({
        type: 'SET_ACTIVE_PROFILE',
        profileId: profileId
    }).catch(error => {
        console.error('设置活跃配置文件失败:', error);
        // 尝试重新连接并再次发送
        if (connectToBackground()) {
            setTimeout(() => {
                chrome.runtime.sendMessage({
                    type: 'SET_ACTIVE_PROFILE',
                    profileId: profileId
                }).catch(e => console.error('重试后仍然失败:', e));
            }, 100);
        }
    });
}
