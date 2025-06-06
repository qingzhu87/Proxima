// --- STATE ---
let profiles = [];
let activeProfileId = null;

// --- INITIALIZATION ---
// Using an async IIFE for top-level await
(async () => {
    console.log('SwitchyOmega background script starting...');
    try {
        await loadInitialData();
        await applyActiveProfile();
        addEventListeners();
        console.log('SwitchyOmega initialization complete. Active profile:', activeProfileId);
        
        // 保持 service worker 活跃
        keepAlive();
    } catch (error) {
        console.error('Error during initialization:', error);
    }
})();

// 通过定期执行任务来保持 service worker 活跃
function keepAlive() {
    const keepAliveInterval = 20 * 1000; // 20 秒，低于 Chrome 的 30 秒超时
    
    // 设置定时器以保持 service worker 活跃
    const intervalId = setInterval(() => {
        console.log('保持 service worker 活跃中...');
        // 执行一些轻量级操作以保持活跃
        chrome.storage.local.get('activeProfileId', (data) => {
            if (data && data.activeProfileId !== activeProfileId) {
                console.log('检测到活跃配置文件变化，更新中...');
                activeProfileId = data.activeProfileId;
                applyActiveProfile();
            }
        });
    }, keepAliveInterval);
    
    // 注册一个空的 fetch 处理程序以保持 service worker 活跃
    self.addEventListener('fetch', (event) => {
        // 不做任何事情，只是保持 service worker 活跃
    });
    
    // 确保 service worker 在关闭前清理资源
    self.addEventListener('beforeunload', () => {
        clearInterval(intervalId);
    });
    
    // 监听来自 popup 的连接请求
    chrome.runtime.onConnect.addListener((port) => {
        console.log('收到来自 popup 的连接');
        port.onDisconnect.addListener(() => {
            console.log('popup 已断开连接');
        });
    });
}


// --- DATA & STATE MANAGEMENT ---
async function loadInitialData() {
    console.log('Loading initial data...');
    // Load all profiles from sync storage
    const profileData = await chrome.storage.sync.get('profiles');
    profiles = profileData.profiles || getDefaultProfiles();
    console.log('Loaded profiles:', profiles);

    // Load the active profile ID from local storage
    const activeProfileData = await chrome.storage.local.get('activeProfileId');
    activeProfileId = activeProfileData.activeProfileId || 'system'; // Default to system proxy
    console.log('Active profile ID:', activeProfileId);
}

async function reloadProfiles() {
    console.log('Reloading profiles...');
    const profileData = await chrome.storage.sync.get('profiles');
    profiles = profileData.profiles || getDefaultProfiles();
    console.log('Reloaded profiles:', profiles);
}

async function setActiveProfile(profileId) {
    console.log(`Setting active profile to: ${profileId}`);
    activeProfileId = profileId;
    await chrome.storage.local.set({ activeProfileId: profileId });
    await applyActiveProfile();
}


// --- PROXY LOGIC ---
async function applyActiveProfile() {
    console.log(`Applying active profile: ${activeProfileId}`);
    const profile = findProfile(activeProfileId);
    if (!profile) {
        console.warn(`Profile with id "${activeProfileId}" not found. Defaulting to system proxy.`);
        await setProxy({ mode: 'system' }); // Fallback to system proxy
        return;
    }

    try {
        console.log(`Applying profile: ${profile.name} (${profile.type})`, profile);
        let config = {};

        switch (profile.type) {
            case 'direct':
                console.log('Setting direct connection mode');
                config = { mode: 'direct' };
                break;
            case 'system':
                console.log('Setting system proxy mode');
                config = { mode: 'system' };
                break;
            case 'proxy':
                if (!profile.proxy || !profile.proxy.host || !profile.proxy.port) {
                    console.error('Proxy profile is missing host or port.', profile);
                    return; // Or fallback to direct
                }
                
                // Ensure the scheme is correctly formatted for Chrome API
                let scheme = profile.proxy.scheme || 'http';
                
                // Chrome expects 'socks' for SOCKS4, and 'socks5' for SOCKS5
                if (scheme === 'socks4') {
                    scheme = 'socks';
                    console.log('Converted socks4 scheme to socks for Chrome API compatibility');
                }
                
                console.log(`Setting fixed_servers mode with ${scheme} proxy: ${profile.proxy.host}:${profile.proxy.port}`);
                config = {
                    mode: 'fixed_servers',
                    rules: {
                        singleProxy: {
                            scheme: scheme,
                            host: profile.proxy.host,
                            port: parseInt(profile.proxy.port, 10), // Ensure port is a number
                        },
                        // Chrome handles the matching logic, including wildcards (*.example.com)
                        bypassList: profile.bypassList || [],
                    },
                };
                console.log('Full proxy configuration:', JSON.stringify(config, null, 2));
                break;
            default:
                console.error(`Unknown profile type: ${profile.type}`);
                return;
        }

        await setProxy(config);
        updateIcon(profile);
        
        // Verify the proxy settings were applied correctly
        await verifyProxySettings(config);

    } catch (error) {
        console.error('Failed to apply proxy settings:', error);
    }
}

async function setProxy(config) {
    try {
        console.log('Setting proxy with config:', config);
        await chrome.proxy.settings.set({
            value: config,
            scope: 'regular',
        });
        
        if (chrome.runtime.lastError) {
            console.error(`Proxy setting error: ${chrome.runtime.lastError.message}`, config);
            return false;
        } else {
            console.log('Proxy settings applied successfully:', config);
            return true;
        }
    } catch (error) {
        console.error('Caught error while setting proxy:', error, config);
        return false;
    }
}

async function verifyProxySettings(expectedConfig) {
    try {
        console.log('Verifying proxy settings...');
        const settings = await chrome.proxy.settings.get({});
        console.log('Current proxy settings:', settings);
        
        if (!settings || !settings.value) {
            console.error('Failed to retrieve current proxy settings');
            return;
        }
        
        const currentConfig = settings.value;
        console.log('Expected mode:', expectedConfig.mode);
        console.log('Current mode:', currentConfig.mode);
        
        if (currentConfig.mode !== expectedConfig.mode) {
            console.error(`Proxy mode mismatch! Expected: ${expectedConfig.mode}, Got: ${currentConfig.mode}`);
        } else {
            console.log(`Proxy mode verified: ${currentConfig.mode}`);
            
            // For proxy mode, verify the host and port
            if (expectedConfig.mode === 'fixed_servers' && 
                expectedConfig.rules && expectedConfig.rules.singleProxy) {
                const expected = expectedConfig.rules.singleProxy;
                const current = currentConfig.rules && currentConfig.rules.singleProxy;
                
                if (!current) {
                    console.error('Missing singleProxy in current settings!');
                } else {
                    console.log('Expected proxy:', expected);
                    console.log('Current proxy:', current);
                    
                    if (expected.host !== current.host || expected.port !== current.port) {
                        console.error(`Proxy server mismatch! Expected: ${expected.host}:${expected.port}, Got: ${current.host}:${current.port}`);
                    } else {
                        console.log(`Proxy server verified: ${current.host}:${current.port}`);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error verifying proxy settings:', error);
    }
}


// --- UI & EVENT HANDLING ---
function addEventListeners() {
    // Listen for messages from popup or options page
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log('Received message:', message);
        
        // 确保在处理消息之前状态已加载
        const ensureStateLoaded = async () => {
            // 如果状态尚未加载（例如，background 刚被唤醒），则加载它
            if (profiles.length === 0) {
                console.log('Background script was inactive, reloading state...');
                await loadInitialData();
            }
            
            if (message.type === 'PROFILES_CHANGED') {
                console.log('Profiles changed, reloading...');
                await reloadProfiles();
                await applyActiveProfile();
                sendResponse({ success: true });
            } else if (message.type === 'SET_ACTIVE_PROFILE') {
                console.log(`Setting active profile to: ${message.profileId}`);
                await setActiveProfile(message.profileId);
                sendResponse({ success: true });
            } else if (message.type === 'GET_APP_STATE') {
                // Return both user-defined and built-in profiles for the popup
                const allProfiles = [...getBuiltInProfiles(), ...profiles];
                console.log('Sending app state to popup:', { profiles: allProfiles, activeProfileId });
                sendResponse({ profiles: allProfiles, activeProfileId });
            }
        };
        
        // 执行状态加载和消息处理
        ensureStateLoaded().catch(error => {
            console.error('Error handling message:', error);
            sendResponse({ error: error.message });
        });
        
        // Return true to indicate you wish to send a response asynchronously
        return true;
    });
}

function updateIcon(profile) {
    // Logic to update the extension icon based on the active profile
    // This is a placeholder for more sophisticated icon updates
    if (profile.type === 'proxy') {
        chrome.action.setBadgeText({ text: 'P' });
        chrome.action.setBadgeBackgroundColor({ color: '#3498db' });
    } else if (profile.type === 'system') {
        chrome.action.setBadgeText({ text: 'S' });
        chrome.action.setBadgeBackgroundColor({ color: '#2ecc71' });
    } else {
        chrome.action.setBadgeText({ text: '' });
    }
}


// --- UTILITIES ---
function findProfile(profileId) {
    // Also include built-in profiles for matching
    return [...profiles, ...getBuiltInProfiles()].find(p => p.id === profileId);
}

function getBuiltInProfiles() {
    return [
        { id: 'direct', name: '[Direct Connection]', type: 'direct', builtin: true },
        { id: 'system', name: '[System Proxy]', type: 'system', builtin: true },
    ];
}

function getDefaultProfiles() {
    // If no user-defined profiles exist in storage, return an empty array.
    // The extension will default to a built-in mode like 'system' or 'direct'.
    return [];
}
