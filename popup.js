// --- STATE ---
let state = {
    profiles: [],
    activeProfileId: null,
};

// --- DOM ELEMENTS ---
const elements = {
    profileList: document.getElementById('profile-list'),
    optionsBtn: document.getElementById('options-btn'),
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', initialize);

async function initialize() {
    addEventListeners();
    try {
        const appState = await chrome.runtime.sendMessage({ type: 'GET_APP_STATE' });
        if (appState) {
            state = appState;
            render();
        } else {
            // Handle case where background script might not be ready
            console.warn("Could not retrieve app state. The background service might be starting.");
            elements.profileList.innerHTML = '<li>Loading...</li>';
        }
    } catch (error) {
        console.error("Error getting app state:", error);
        // This can happen if the extension is reloaded, and the popup is open.
        elements.profileList.innerHTML = `<li>Error: ${error.message}. Please reopen the popup.</li>`;
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
    });
}
