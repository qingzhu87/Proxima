/* eslint-disable no-use-before-define */

// --- STATE MANAGEMENT ---
let state = {
  profiles: [],
  workingCopy: [],
  selectedProfileId: null,
  hasChanges: false,
};

// Profile colors for icons
const profileColors = [
  '#3498db', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6', 
  '#1abc9c', '#d35400', '#34495e', '#16a085', '#c0392b',
  '#8e44ad', '#27ae60', '#e67e22', '#2980b9', '#f1c40f'
];

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
  
  // Ensure each profile has a color assigned
  state.profiles.forEach(profile => {
    if (!profile.color) {
      profile.color = getRandomProfileColor();
    }
  });
  
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

        // Create the profile icon with the profile's color
        const icon = document.createElement('span');
        icon.className = 'profile-icon';
        icon.style.backgroundColor = profile.color || getRandomProfileColor();
        
        // Add the first letter of the profile name to the icon
        const firstLetter = profile.name.charAt(0).toUpperCase();
        icon.textContent = firstLetter;

        // Create the profile name element
        const nameElem = document.createElement('span');
        nameElem.className = 'profile-name';
        nameElem.textContent = profile.name;

        // Create the color picker button
        const colorPickerBtn = document.createElement('button');
        colorPickerBtn.className = 'profile-color-picker';
        colorPickerBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3C16.392 3 20 6.608 20 11C20 15.392 16.392 19 12 19C10.4178 19 8.91298 18.5159 7.6499 17.6475C7.23374 17.3366 6.4202 17.3366 6.00404 17.6475C5.40836 18.1 4.5608 18.1 4 17.6475V11C4 6.608 7.608 3 12 3Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="7.5" cy="9.5" r="1.5" fill="currentColor"/><circle cx="12.5" cy="7.5" r="1.5" fill="currentColor"/><circle cx="16.5" cy="9.5" r="1.5" fill="currentColor"/></svg>';
        colorPickerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showColorPicker(profile.id);
        });

        // Add elements to the item
        item.appendChild(icon);
        item.appendChild(nameElem);
        item.appendChild(colorPickerBtn);
        
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
        // 将文本框中的内容按行拆分
        const lines = value.split('\n').map(s => s.trim()).filter(Boolean);
        
        // 解码HTML实体，确保<local>被正确保存
        const decodeHtmlEntities = (text) => {
            const textarea = document.createElement('textarea');
            textarea.innerHTML = text;
            return textarea.value;
        };
        
        profile.bypassList = lines.map(decodeHtmlEntities);
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
        color: getRandomProfileColor(),
        proxy: {
            scheme: 'http',
            host: '127.0.0.1',
            port: 8080,
        },
        bypassList: [
            '<local>',
            '127.0.0.1',
            '::1',
            'localhost'
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

// --- COLOR PICKER ---
function showColorPicker(profileId) {
    const profileIndex = state.workingCopy.findIndex(p => p.id === profileId);
    if (profileIndex === -1) return;
    
    // Create a color picker dialog
    const dialog = document.createElement('div');
    dialog.className = 'color-picker-dialog';
    
    // Create the title
    const title = document.createElement('h3');
    title.textContent = 'Choose Profile Color';
    
    // Create the color grid
    const colorGrid = document.createElement('div');
    colorGrid.className = 'color-grid';
    
    // Add color options
    profileColors.forEach(color => {
        const colorOption = document.createElement('button');
        colorOption.className = 'color-option';
        colorOption.style.backgroundColor = color;
        
        if (color === state.workingCopy[profileIndex].color) {
            colorOption.classList.add('selected');
        }
        
        colorOption.addEventListener('click', () => {
            state.workingCopy[profileIndex].color = color;
            state.hasChanges = true;
            dialog.remove();
            overlay.remove();
            renderProfileList();
            renderMainContent(); // Also re-render main content to update the header color
            updateActionButtons();
        });
        colorGrid.appendChild(colorOption);
    });
    
    // Create close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Cancel';
    closeBtn.className = 'dialog-cancel-btn';
    closeBtn.addEventListener('click', () => {
        dialog.remove();
        overlay.remove();
    });
    
    // Add elements to dialog
    dialog.appendChild(title);
    dialog.appendChild(colorGrid);
    dialog.appendChild(closeBtn);
    
    // Add overlay
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.addEventListener('click', () => {
        dialog.remove();
        overlay.remove();
    });
    
    // Add to body
    document.body.appendChild(overlay);
    document.body.appendChild(dialog);
}

// Advanced color picker with color wheel and presets
function showAdvancedColorPicker(profileId) {
    const profileIndex = state.workingCopy.findIndex(p => p.id === profileId);
    if (profileIndex === -1) return;
    
    const currentColor = state.workingCopy[profileIndex].color || getRandomProfileColor();
    
    // Create dialog container
    const dialog = document.createElement('div');
    dialog.className = 'advanced-color-picker-dialog';
    
    // Create header with title
    const header = document.createElement('div');
    header.className = 'color-picker-header';
    header.innerHTML = `<h3>Profile :: ${state.workingCopy[profileIndex].name}</h3>`;
    
    // Create container for color picker components
    const content = document.createElement('div');
    content.className = 'color-picker-content';
    
    // Create left panel with preset colors
    const presetPanel = document.createElement('div');
    presetPanel.className = 'color-presets-panel';
    
    // 3x3 grid of preset colors
    const presetColors = [
        '#98c1d9', '#8de969', '#f8a978',
        '#ffec99', '#e2b4ff', '#4a69bd',
        '#77dd77', '#c06c45', '#d4af37',
        '#f5a3a3', '#232323'
    ];
    
    presetColors.forEach(color => {
        const presetBtn = document.createElement('button');
        presetBtn.className = 'preset-color-btn';
        presetBtn.style.backgroundColor = color;
        
        if (color === currentColor) {
            presetBtn.classList.add('selected');
            presetBtn.innerHTML = '✓';
        }
        
        presetBtn.addEventListener('click', () => {
            state.workingCopy[profileIndex].color = color;
            state.hasChanges = true;
            dialog.remove();
            overlay.remove();
            renderProfileList();
            renderMainContent();
            updateActionButtons();
        });
        
        presetPanel.appendChild(presetBtn);
    });
    
    // Create right panel with color gradient
    const gradientPanel = document.createElement('div');
    gradientPanel.className = 'color-gradient-panel';
    
    // Create a color preview
    const colorPreview = document.createElement('div');
    colorPreview.className = 'current-color-preview';
    colorPreview.style.backgroundColor = currentColor;
    
    // Create HEX input
    const hexInput = document.createElement('div');
    hexInput.className = 'hex-input-container';
    hexInput.innerHTML = `
        <input type="text" class="hex-input" value="${currentColor}" placeholder="#RRGGBB">
    `;
    
    // Create footer with action buttons
    const footer = document.createElement('div');
    footer.className = 'color-picker-footer';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'dialog-cancel-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
        dialog.remove();
        overlay.remove();
    });
    
    footer.appendChild(cancelBtn);
    
    // Assemble the dialog
    content.appendChild(presetPanel);
    content.appendChild(gradientPanel);
    
    dialog.appendChild(header);
    dialog.appendChild(content);
    dialog.appendChild(colorPreview);
    dialog.appendChild(hexInput);
    dialog.appendChild(footer);
    
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.addEventListener('click', () => {
        dialog.remove();
        overlay.remove();
    });
    
    // Add to body
    document.body.appendChild(overlay);
    document.body.appendChild(dialog);
}

// --- HTML TEMPLATES ---
function createProfileEditorHTML(profile) {
    const isBuiltIn = profile.builtin;
    let editorHTML = `
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
            <div class="proxy-fields-container">
                <div class="proxy-field">
                    <div class="proxy-field-label" data-i18n="proxySchemeLabel">Scheme</div>
                    <select name="proxy.scheme" class="proxy-scheme-select">
                        <option value="http" ${p.scheme === 'http' ? 'selected' : ''}>HTTP</option>
                        <option value="https" ${p.scheme === 'https' ? 'selected' : ''}>HTTPS</option>
                        <option value="socks4" ${p.scheme === 'socks4' ? 'selected' : ''}>SOCKS4</option>
                        <option value="socks5" ${p.scheme === 'socks5' ? 'selected' : ''}>SOCKS5</option>
                    </select>
                </div>
                
                <div class="proxy-field proxy-field-server">
                    <div class="proxy-field-label" data-i18n="proxyServerLabel">Server</div>
                    <input type="text" name="proxy.host" data-i18n-placeholder="proxyHostPlaceholder" placeholder="127.0.0.1" value="${p.host}" class="proxy-host-input">
                </div>
                
                <div class="proxy-field">
                    <div class="proxy-field-label" data-i18n="proxyPortLabel">Port</div>
                    <input type="number" name="proxy.port" data-i18n-placeholder="proxyPortPlaceholder" placeholder="8080" value="${p.port}" class="proxy-port-input">
                </div>
            </div>
        </fieldset>
    `;
}

function createBypassListHTML(bypassList) {
    let list = bypassList || [];
    if (list.length === 0) {
        list = [
            '<local>',
            '127.0.0.1',
            '::1',
            'localhost'
        ];
    }
    
    // 确保HTML特殊字符被转义
    const escapeHtml = (text) => {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    };
    
    const listStr = list.map(escapeHtml).join('\n');
    
    return `
        <fieldset class="bypass-list-settings">
            <legend data-i18n="bypassListLegend">Bypass List</legend>
            <div class="form-group">
                <p class="form-description" style="margin-top: 0; margin-bottom: 8px;" data-i18n="bypassListDescription">Servers for which you do not want to use any proxy: (One server on each line.)</p>
                <textarea name="bypassList" class="bypass-list-textarea" rows="6">${listStr}</textarea>
                <p class="form-description" data-i18n="bypassListNote"><strong>Note:</strong> '&lt;local&gt;' is a special pattern that matches all hostnames not containing a dot. '127.0.0.1', '::1', and 'localhost' are common local addresses that should be included.</p>
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

// Get a random color for profile icons
function getRandomProfileColor() {
  return profileColors[Math.floor(Math.random() * profileColors.length)];
}
