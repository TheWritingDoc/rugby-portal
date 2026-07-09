// When a signed-in staff member creates someone through the delegated
// Create User flow, the new person almost always belongs to the creator's own
// zone/school. Pre-fill those from the session so a school admin never has to
// hunt for their own school in a huge dropdown. These are defaults, not locks —
// the selects stay editable and the server enforces real authority regardless.
export function creatorScope() {
  const signedIn = Boolean(localStorage.getItem('auth:token'))
  return {
    signedIn,
    zoneId: signedIn ? localStorage.getItem('auth:zoneId') || '' : '',
    schoolId: signedIn ? localStorage.getItem('auth:schoolId') || '' : '',
  }
}
