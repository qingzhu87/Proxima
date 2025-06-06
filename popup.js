class PopupManager {
  constructor() {
    this.currentProfile = "direct"
    this.profiles = []
    this.init()
  }

  async init() {
    await this.loadProfiles()
    await this.loadCurrentProfile()
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
      },
    ]
  }

  async loadCurrentProfile() {
    try {
      const result = await chrome.storage.local.get(["currentProfile"])
      this.currentProfile = result.currentProfile || "direct"
    } catch (error) {
      console.error("Failed to load current profile:", error)
    }
  }

  renderProfiles() {
    const profileList = document.getElementById("profileList")
    const currentProfileSpan = document.getElementById("currentProfile")

    if (!profileList || !currentProfileSpan) return

    profileList.innerHTML = ""

    this.profiles.forEach((profile) => {
      const profileItem = this.createProfileItem(profile)
      profileList.appendChild(profileItem)
    })

    const currentProfileObj = this.profiles.find((p) => p.id === this.currentProfile)
    currentProfileSpan.textContent = currentProfileObj ? currentProfileObj.name : "Direct"
  }

  createProfileItem(profile) {
    const item = document.createElement("div")
    item.className = `profile-item ${profile.id === this.currentProfile ? "active" : ""}`
    item.dataset.profileId = profile.id

    const icon = document.createElement("div")
    icon.className = `profile-icon ${profile.type}`
    icon.style.backgroundColor = profile.color || "#666"
    icon.textContent = profile.name.charAt(0).toUpperCase()

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
      details.textContent = `${profile.host}:${profile.port}`
    }

    info.appendChild(name)
    info.appendChild(details)
    item.appendChild(icon)
    item.appendChild(info)

    item.addEventListener("click", () => this.switchProfile(profile.id))

    return item
  }

  async switchProfile(profileId) {
    try {
      const profile = this.profiles.find((p) => p.id === profileId)
      if (!profile) return

      // Send message to background script to change proxy
      await chrome.runtime.sendMessage({
        action: "switchProfile",
        profileId: profileId,
      })

      this.currentProfile = profileId
      await chrome.storage.local.set({ currentProfile: profileId })

      this.renderProfiles()
    } catch (error) {
      console.error("Failed to switch profile:", error)
    }
  }

  bindEvents() {
    const optionsBtn = document.getElementById("optionsBtn")
    const refreshBtn = document.getElementById("refreshBtn")

    if (optionsBtn) {
      optionsBtn.addEventListener("click", () => {
        chrome.runtime.openOptionsPage()
      })
    }

    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => {
        this.init()
      })
    }
  }
}

// Initialize popup when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new PopupManager()
})
