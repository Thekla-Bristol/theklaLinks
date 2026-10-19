// Thekla Links settings: the only file you need to edit to switch on the admin portal.
//
// Firebase: paste the "firebaseConfig" values from
//   Firebase console → Project settings (gear icon) → General → Your apps → Thekla Links.
// These values are safe to publish. Access is controlled by firestore.rules.
// While projectId is empty, the page works exactly as before and /admin explains how to set up.
window.THEKLA_CONFIG = {
  firebase: {
    apiKey: "AIzaSyD3XL--9boPR_B7DAh0-zuAIvRvFEiCOKQ",
    authDomain: "thekla-links.firebaseapp.com",
    projectId: "Thekla Links",
    appId: "1:457564785340:web:0c52324e73d70e42d69eb9",
  },

  // Your GitHub repository, e.g. "theklabristol/thekla-links". Used by the admin
  // portal's "Refresh listings now" button.
  githubRepo: "",

  // Owners are always admins and can't be removed. To change them, edit this list AND
  // the same list in firestore.rules (then publish the rules in the Firebase console).
  owners: ["harrison@theklabristol.co.uk", "phoebe@theklabristol.co.uk"],
};
