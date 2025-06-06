/* eslint-disable no-use-before-define */

// --- STATE MANAGEMENT ---
let state = {
  profiles: [],
  workingCopy: [],
  selectedProfileId: null,
  hasChanges: false,
};

// --- DOM ELEMENTS ---
const elements = {
    profileList: document.getElementById('profile-list'),
    mainContent: document.getElementById('main-content'),
    newProfileBtn: document.getElementById('new-profile-btn'),
    applyChangesBtn: document.getElementById('apply-changes-btn'),
    discardChangesBtn: document.getElementById('discard-changes-btn'),
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', initialize);

async function initialize() {
  applyI18n();
  elements.newProfileBtn.addEventListener('click', handleNewProfile);
  elements.applyChangesBtn.addEventListener('click', handleApplyChanges);
  elements.discardChangesBtn.addEventListener('click', handleDiscardChanges);
  elements.profileList.addEventListener('click', handleProfileSelect);
  
  await loadProfiles();
  
  // Select the first profile by default, if any
  if (state.profiles.length > 0) {
    state.selectedProfileId = state.profiles[0].id;
  }
  
  render();
}

// --- DATA HANDLING ---
async function loadProfiles() {
  const data = await chrome.storage.sync.get('profiles');
  const allProfiles = data.profiles || getDefaultProfiles();
  // Filter out built-in profiles, so they are not managed on this page.
  state.profiles = allProfiles.filter(p => !p.builtin);
  resetWorkingCopy();
}

async function saveProfiles() {
  await chrome.storage.sync.set({ profiles: state.profiles });
  // Also tell the background script to reload the profiles
  chrome.runtime.sendMessage({ type: 'PROFILES_CHANGED' });
}

function resetWorkingCopy() {
  state.workingCopy = JSON.parse(JSON.stringify(state.profiles));
  state.hasChanges = false;
  updateActionButtons();
}

// --- RENDERING ---
function render() {
  renderProfileList();
  renderMainContent();
  updateActionButtons();
}

function renderProfileList() {
    elements.profileList.innerHTML = '';
    state.workingCopy.forEach(profile => {
        const item = document.createElement('li');
        item.className = 'profile-item';
        item.dataset.profileId = profile.id;
        
        if (profile.id === state.selectedProfileId) {
            item.classList.add('active');
        }

        // In a real scenario, you might have different icons
        const icon = profile.type === 'direct' ? '🌐' : '🖥️';

        item.innerHTML = `
            <span class="profile-icon">${icon}</span>
            <span class="profile-name">${profile.name}</span>
        `;
        elements.profileList.appendChild(item);
    });
}

function renderMainContent() {
    if (!state.selectedProfileId) {
        elements.mainContent.innerHTML = `
            <div class="welcome-pane">
                <h2 data-i18n="welcomeHeader">Welcome to Zero Omega</h2>
                <p data-i18n="welcomeMessage">Select a profile on the left to get started, or create a new one.</p>
            </div>`;
        applyI18n();
        return;
    }

    const profile = state.workingCopy.find(p => p.id === state.selectedProfileId);
    if (!profile) {
        // This case should ideally not happen
        state.selectedProfileId = null;
        renderMainContent();
        return;
    }

    elements.mainContent.innerHTML = createProfileEditorHTML(profile);
    
    // Add event listeners for the new form
    const form = elements.mainContent.querySelector('#profile-editor-form');
    form.addEventListener('input', handleFormChange);

    const deleteBtn = elements.mainContent.querySelector('.delete-profile-btn');
    if(deleteBtn) {
        deleteBtn.addEventListener('click', () => handleDeleteProfile(profile.id));
    }
}

function updateActionButtons() {
    elements.applyChangesBtn.disabled = !state.hasChanges;
    elements.discardChangesBtn.disabled = !state.hasChanges;
}

// --- EVENT HANDLERS ---
function handleProfileSelect(event) {
    const target = event.target.closest('.profile-item');
    if (!target) return;

    const profileId = target.dataset.profileId;
    if (state.selectedProfileId !== profileId) {
        state.selectedProfileId = profileId;
        render();
    }
}

function handleFormChange(event) {
    if (!state.selectedProfileId) return;

    const profileIndex = state.workingCopy.findIndex(p => p.id === state.selectedProfileId);
    if (profileIndex === -1) return;

    const profile = state.workingCopy[profileIndex];
    const { name, value } = event.target;

    if (name === 'bypassList') {
        profile.bypassList = value.split('\n').map(s => s.trim()).filter(Boolean);
    } else {
        // A simple way to update nested properties if needed in the future
        // e.g., name="proxy.host"
        const keys = name.split('.');
        if (keys.length === 1) {
            profile[name] = value;
        } else {
            // For nested objects like proxy settings
            if (!profile[keys[0]]) profile[keys[0]] = {};
            profile[keys[0]][keys[1]] = value;
        }
    }

    state.hasChanges = true;
    updateActionButtons();

    // If the profile name was changed, re-render the list to show the new name.
    if (name === 'name') {
        renderProfileList();
    }
}

function handleNewProfile() {
    const newProfile = {
        id: `profile_${Date.now()}`,
        name: 'New Profile',
        type: 'proxy',
        proxy: {
            scheme: 'http',
            host: '127.0.0.1',
            port: 8080,
        },
        bypassList: [
            '<local>'
        ]
    };
    state.workingCopy.push(newProfile);
    state.selectedProfileId = newProfile.id;
    state.hasChanges = true;
    render();
}

function handleDeleteProfile(profileId) {
    state.workingCopy = state.workingCopy.filter(p => p.id !== profileId);
    if (state.selectedProfileId === profileId) {
        state.selectedProfileId = state.workingCopy.length > 0 ? state.workingCopy[0].id : null;
    }
    state.hasChanges = true;
    render();
}

async function handleApplyChanges() {
    state.profiles = JSON.parse(JSON.stringify(state.workingCopy));
    await saveProfiles();
    state.hasChanges = false;
    updateActionButtons();
}

function handleDiscardChanges() {
    resetWorkingCopy();
    // check if selected profile still exists
    if (!state.workingCopy.find(p => p.id === state.selectedProfileId)) {
      state.selectedProfileId = state.workingCopy.length > 0 ? state.workingCopy[0].id : null;
    }
    render();
}


// --- HTML TEMPLATES ---
function createProfileEditorHTML(profile) {
    const isBuiltIn = profile.builtin;
    let editorHTML = `
        <div class="profile-editor-header">
            <h3>${profile.name}</h3>
        </div>
        <form id="profile-editor-form" class="profile-editor-form">
            <div class="form-group">
                <label for="name" data-i18n="profileNameLabel">Profile Name</label>
                <input type="text" id="name" name="name" value="${profile.name}" ${isBuiltIn ? 'disabled' : ''}>
            </div>

            ${createProxySettingsHTML(profile.proxy)}

            ${createBypassListHTML(profile.bypassList)}
            
            ${!isBuiltIn ? `
            <div class="form-actions">
                <button type="button" class="action-button-danger delete-profile-btn" data-i18n="deleteProfile">Delete This Profile</button>
            </div>` : ''}
        </form>
    `;
    return editorHTML;
}

function createProxySettingsHTML(proxy) {
    const p = proxy || { scheme: 'http', host: '', port: '' };
    return `
        <fieldset class="proxy-settings">
            <legend data-i18n="proxyServerLegend">Proxy Server Details</legend>
            <div class="form-group-inline">
                <select name="proxy.scheme" class="proxy-scheme-select">
                    <option value="http" ${p.scheme === 'http' ? 'selected' : ''}>HTTP</option>
                    <option value="https" ${p.scheme === 'https' ? 'selected' : ''}>HTTPS</option>
                    <option value="socks4" ${p.scheme === 'socks4' ? 'selected' : ''}>SOCKS4</option>
                    <option value="socks5" ${p.scheme === 'socks5' ? 'selected' : ''}>SOCKS5</option>
                </select>
                <input type="text" name="proxy.host" data-i18n-placeholder="proxyHostPlaceholder" placeholder="Proxy host" value="${p.host}" class="proxy-host-input">
                <input type="number" name="proxy.port" data-i18n-placeholder="proxyPortPlaceholder" placeholder="Port" value="${p.port}" class="proxy-port-input">
            </div>
        </fieldset>
    `;
}

function createBypassListHTML(bypassList) {
    const list = (bypassList || []).join('\n');
    return `
        <fieldset class="bypass-list-settings">
            <legend data-i18n="bypassListLegend">Bypass List</legend>
            <div class="form-group">
                <textarea name="bypassList" class="bypass-list-textarea" rows="4">${list}</textarea>
                <p class="form-description" data-i18n="bypassListDescription">One entry per line. These hosts will not be proxied.</p>
            </div>
        </fieldset>
    `;
}

// --- I18N ---
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(elem => {
    const key = elem.getAttribute('data-i18n');
    const translation = chrome.i18n.getMessage(key);
    if (translation) {
      // Avoid translating elements that are part of a form's state
      if (elem.tagName !== 'INPUT' && elem.tagName !== 'TEXTAREA') {
          elem.textContent = translation;
      }
    }
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(elem => {
      const key = elem.getAttribute('data-i18n-placeholder');
      const translation = chrome.i18n.getMessage(key);
      if(translation) {
          elem.setAttribute('placeholder', translation);
      }
  });
}

// --- DEFAULTS & UTILITIES ---
function getDefaultProfiles() {
  // If no profiles are in storage, the user has none.
  // The options page should reflect this by showing an empty list.
  return [];
}

// Add some missing styles
const style = document.createElement('style');
style.textContent = `
    .profile-editor-header { margin-bottom: 24px; border-bottom: 1px solid var(--border-color); padding-bottom: 16px; }
    .profile-editor-header h3 { font-size: 20px; font-weight: 500; }
    .profile-editor-form .form-group { margin-bottom: 16px; }
    .profile-editor-form label { display: block; margin-bottom: 8px; font-weight: 500; font-size: 14px; }
    .profile-editor-form input[type="text"],
    .profile-editor-form input[type="number"],
    .profile-editor-form select {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid var(--border-color);
        border-radius: var(--border-radius);
        font-size: 14px;
        background-color: #fff;
    }
    .profile-editor-form input:disabled,
    .profile-editor-form select:disabled {
        background-color: var(--background-color);
        cursor: not-allowed;
    }
    .proxy-settings { border: 1px solid var(--border-color); padding: 16px; border-radius: var(--border-radius); margin-top: 20px; }
    .proxy-settings legend { font-weight: 500; padding: 0 8px; }
    .form-group-inline { display: flex; gap: 8px; align-items: center; }
    .proxy-scheme-select { width: 100px !important; flex-shrink: 0; }
    .proxy-host-input { flex-grow: 1; }
    .proxy-port-input { width: 80px !important; flex-shrink: 0; }
    .form-actions { margin-top: 32px; padding-top: 16px; border-top: 1px solid var(--border-color); }
    .bypass-list-settings { border: 1px solid var(--border-color); padding: 16px; border-radius: var(--border-radius); margin-top: 20px; }
    .bypass-list-settings legend { font-weight: 500; padding: 0 8px; }
    .bypass-list-textarea {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid var(--border-color);
        border-radius: var(--border-radius);
        font-size: 14px;
        background-color: #fff;
        font-family: var(--font-family);
        resize: vertical;
        min-height: 80px;
    }
    .form-description {
        font-size: 12px;
        color: var(--text-color-light);
        margin-top: 8px;
    }
    .action-button-danger {
        background-color: #e74c3c;
        color: white;
        border: none;
        padding: 10px 15px;
        border-radius: var(--border-radius);
        cursor: pointer;
        transition: background-color 0.2s ease;
    }
    .action-button-danger:hover { background-color: #c0392b; }
`;
document.head.appendChild(style);
