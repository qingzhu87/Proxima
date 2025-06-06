class OptionsManager {
  constructor() {
    this.profiles = []
    this.currentEditingProfile = null
    this.init()
  }

  async init() {
    await this.loadProfiles()
    this.renderProfiles()
    this.bindEvents()
  }

  async loadProfiles() {
    try {
      const result = await chrome.storage.sync.get(["profiles"])
      this.profiles = result.profiles || this.getDefaultProfiles()
    } catch (error) {
      console.error("Failed to load profiles:", error)
      this.profiles = this.getDefaultProfiles()
    }
  }

  getDefaultProfiles() {
    return [
      {
        id: "direct",
        name: "Direct",
        type: "direct",
        color: "#34a853",
        builtin: true,
      },
    ]
  }

  async saveProfiles() {
    try {
      await chrome.storage.sync.set({ profiles: this.profiles })
    } catch (error) {
      console.error("Failed to save profiles:", error)
    }
  }

  renderProfiles() {
    const profileList = document.getElementById("profileList")
    if (!profileList) return

    profileList.innerHTML = ""

    this.profiles.forEach((profile) => {
      const profileItem = this.createProfileItem(profile)
      profileList.appendChild(profileItem)
    })
  }

  createProfileItem(profile) {
    const item = document.createElement("div")
    item.className = `profile-item ${profile.type}`
    item.dataset.profileId = profile.id

    const info = document.createElement("div")
    info.className = "profile-info"

    const name = document.createElement("div")
    name.className = "profile-name"
    name.textContent = profile.name

    const details = document.createElement("div")
    details.className = "profile-details"

    if (profile.type === "direct") {
      details.textContent = "Direct connection"
    } else {
      details.textContent = `${profile.type.toUpperCase()} ${profile.host}:${profile.port}`
    }

    info.appendChild(name)
    info.appendChild(details)
    item.appendChild(info)

    if (!profile.builtin) {
      const actions = document.createElement("div")
      actions.className = "profile-actions"

      const deleteBtn = document.createElement("button")
      deleteBtn.className = "delete-btn"
      deleteBtn.textContent = "Delete"
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation()
        this.deleteProfile(profile.id)
      })

      actions.appendChild(deleteBtn)
      item.appendChild(actions)
    }

    item.addEventListener("click", () => this.editProfile(profile))

    return item
  }

  editProfile(profile) {
    this.currentEditingProfile = profile
    const editorTitle = document.getElementById("editorTitle")
    const editorContent = document.getElementById("editorContent")

    if (!editorTitle || !editorContent) return

    editorTitle.textContent = `Edit ${profile.name}`

    if (profile.type === "direct") {
      editorContent.innerHTML = `
        <div class="form-group">
          <label>Profile Name:</label>
          <input type="text" value="${profile.name}" disabled>
        </div>
        <div class="form-group">
          <label>Type:</label>
          <input type="text" value="Direct Connection" disabled>
        </div>
        <p><em>Direct connection profile cannot be modified.</em></p>
      `
    } else {
      editorContent.innerHTML = `
        <form id="editProfileForm">
          <div class="form-group">
            <label for="editProfileName">Profile Name:</label>
            <input type="text" id="editProfileName" value="${profile.name}" required>
          </div>
          <div class="form-group">
            <label for="editProfileType">Type:</label>
            <select id="editProfileType">
              <option value="http" ${profile.type === "http" ? "selected" : ""}>HTTP</option>
              <option value="https" ${profile.type === "https" ? "selected" : ""}>HTTPS</option>
              <option value="socks4" ${profile.type === "socks4" ? "selected" : ""}>SOCKS4</option>
              <option value="socks5" ${profile.type === "socks5" ? "selected" : ""}>SOCKS5</option>
            </select>
          </div>
          <div class="form-group">
            <label for="editProfileHost">Server:</label>
            <input type="text" id="editProfileHost" value="${profile.host}" required>
          </div>
          <div class="form-group">
            <label for="editProfilePort">Port:</label>
            <input type="number" id="editProfilePort" value="${profile.port}" required>
          </div>
          <div class="form-actions">
            <button type="button" id="deleteProfileBtn" class="btn btn-danger">Delete Profile</button>
            <button type="submit" class="btn btn-primary">Save Changes</button>
          </div>
        </form>
      `

      const editForm = document.getElementById("editProfileForm")
      const deleteBtn = document.getElementById("deleteProfileBtn")

      if (editForm) {
        editForm.addEventListener("submit", (e) => this.handleEditProfile(e))
      }

      if (deleteBtn) {
        deleteBtn.addEventListener("click", () => this.deleteProfile(profile.id))
      }
    }

    // Update active state
    document.querySelectorAll(".profile-item").forEach((item) => {
      item.classList.remove("active")
    })
    document.querySelector(`[data-profile-id="${profile.id}"]`)?.classList.add("active")
  }

  async handleEditProfile(e) {
    e.preventDefault()

    const name = document.getElementById("editProfileName").value.trim()
    const type = document.getElementById("editProfileType").value
    const host = document.getElementById("editProfileHost").value.trim()
    const port = Number.parseInt(document.getElementById("editProfilePort").value)

    if (!name || !host || !port) {
      alert("Please fill in all fields")
      return
    }

    const profileIndex = this.profiles.findIndex((p) => p.id === this.currentEditingProfile.id)
    if (profileIndex !== -1) {
      this.profiles[profileIndex] = {
        ...this.profiles[profileIndex],
        name,
        type,
        host,
        port,
      }

      await this.saveProfiles()
      this.renderProfiles()
      this.editProfile(this.profiles[profileIndex])
    }
  }

  async deleteProfile(profileId) {
    if (!confirm("Are you sure you want to delete this profile?")) {
      return
    }

    this.profiles = this.profiles.filter((p) => p.id !== profileId)
    await this.saveProfiles()
    this.renderProfiles()

    // Clear editor if deleted profile was being edited
    if (this.currentEditingProfile && this.currentEditingProfile.id === profileId) {
      const editorTitle = document.getElementById("editorTitle")
      const editorContent = document.getElementById("editorContent")

      if (editorTitle) editorTitle.textContent = "Select a profile"
      if (editorContent) {
        editorContent.innerHTML = '<p class="placeholder">Select a profile from the left to edit its settings.</p>'
      }

      this.currentEditingProfile = null
    }
  }

  showAddProfileModal() {
    const modal = document.getElementById("addProfileModal")
    if (modal) {
      modal.classList.add("show")
    }
  }

  hideAddProfileModal() {
    const modal = document.getElementById("addProfileModal")
    if (modal) {
      modal.classList.remove("show")
    }

    // Reset form
    const form = document.getElementById("addProfileForm")
    if (form) {
      form.reset()
    }
  }

  async handleAddProfile(e) {
    e.preventDefault()

    const name = document.getElementById("profileName").value.trim()
    const type = document.getElementById("profileType").value
    const host = document.getElementById("profileHost").value.trim()
    const port = Number.parseInt(document.getElementById("profilePort").value)

    if (!name || !host || !port) {
      alert("Please fill in all fields")
      return
    }

    // Check if profile name already exists
    if (this.profiles.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      alert("A profile with this name already exists")
      return
    }

    const newProfile = {
      id: `profile_${Date.now()}`,
      name,
      type,
      host,
      port,
      color: "#ea4335",
    }

    this.profiles.push(newProfile)
    await this.saveProfiles()
    this.renderProfiles()
    this.hideAddProfileModal()
  }

  bindEvents() {
    const addProfileBtn = document.getElementById("addProfileBtn")
    const closeModal = document.getElementById("closeModal")
    const cancelBtn = document.getElementById("cancelBtn")
    const addProfileForm = document.getElementById("addProfileForm")
    const modal = document.getElementById("addProfileModal")

    if (addProfileBtn) {
      addProfileBtn.addEventListener("click", () => this.showAddProfileModal())
    }

    if (closeModal) {
      closeModal.addEventListener("click", () => this.hideAddProfileModal())
    }

    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => this.hideAddProfileModal())
    }

    if (addProfileForm) {
      addProfileForm.addEventListener("submit", (e) => this.handleAddProfile(e))
    }

    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          this.hideAddProfileModal()
        }
      })
    }
  }
}

// Initialize options page when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new OptionsManager()
})
