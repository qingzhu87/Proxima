class ProxyManager {
  constructor() {
    this.profiles = []
    this.currentProfile = "direct"
    this.init()
  }

  async init() {
    await this.loadProfiles()
    await this.loadCurrentProfile()
    this.bindEvents()

    // Apply current profile on startup
    await this.applyProfile(this.currentProfile)
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

  async loadCurrentProfile() {
    try {
      const result = await chrome.storage.local.get(["currentProfile"])
      this.currentProfile = result.currentProfile || "direct"
    } catch (error) {
      console.error("Failed to load current profile:", error)
    }
  }

  async applyProfile(profileId) {
    const profile = this.profiles.find((p) => p.id === profileId)
    if (!profile) {
      console.error("Profile not found:", profileId)
      return
    }

    try {
      if (profile.type === "direct") {
        // Clear proxy settings for direct connection
        await chrome.proxy.settings.clear({})
        console.log("Applied direct connection")
      } else {
        // Configure proxy settings
        const config = {
          mode: "fixed_servers",
          rules: {
            singleProxy: {
              scheme: profile.type,
              host: profile.host,
              port: profile.port,
            },
          },
        }

        await chrome.proxy.settings.set({
          value: config,
          scope: "regular",
        })

        console.log(`Applied proxy profile: ${profile.name} (${profile.host}:${profile.port})`)
      }

      this.currentProfile = profileId
      await chrome.storage.local.set({ currentProfile: profileId })

      // Update badge
      this.updateBadge(profile)
    } catch (error) {
      console.error("Failed to apply proxy settings:", error)
    }
  }

  updateBadge(profile) {
    if (profile.type === "direct") {
      chrome.action.setBadgeText({ text: "" })
      chrome.action.setBadgeBackgroundColor({ color: "#34a853" })
    } else {
      chrome.action.setBadgeText({ text: "P" })
      chrome.action.setBadgeBackgroundColor({ color: "#ea4335" })
    }
  }

  bindEvents() {
    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === "switchProfile") {
        this.applyProfile(message.profileId)
          .then(() => {
            sendResponse({ success: true })
          })
          .catch((error) => {
            console.error("Failed to switch profile:", error)
            sendResponse({ success: false, error: error.message })
          })
        return true // Keep message channel open for async response
      }
    })

    // Listen for storage changes to update profiles
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === "sync" && changes.profiles) {
        this.profiles = changes.profiles.newValue || this.getDefaultProfiles()
      }
    })
  }
}

// Initialize proxy manager
const proxyManager = new ProxyManager()
