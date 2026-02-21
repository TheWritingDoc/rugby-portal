export function safeJson(s: string) {
  try {
    return JSON.parse(s || '{}')
  } catch {
    return {}
  }
}

export function normalizeRow(r: any) {
  // Try to parse data from various possible sources
  let parsed = {}
  
  // If data is a string, parse it
  if (typeof r?.data === 'string') {
    parsed = safeJson(r.data)
  } else if (r?.data && typeof r.data === 'object') {
    // If data is already an object, use it
    parsed = r.data
  }
  
  // Also check if there's raw data that needs parsing (from debug output)
  if (typeof r?.rawData === 'string') {
    const rawParsed = safeJson(r.rawData)
    parsed = { ...parsed, ...rawParsed }
  }
  
  const merged = {
    ...parsed,
    name: (r.name !== undefined && r.name !== '') ? r.name : parsed.name,
    surname: (r.surname !== undefined && r.surname !== '') ? r.surname : parsed.surname,
    email: (r.email !== undefined && r.email !== '') ? r.email : parsed.email,
    schoolId: (r.schoolId !== undefined && r.schoolId !== '') ? r.schoolId : parsed.schoolId,
    zoneId: (r.zoneId !== undefined && r.zoneId !== '') ? r.zoneId : parsed.zoneId,
    gender: (r.gender !== undefined && r.gender !== '') ? r.gender : parsed.gender,
    ageGroup: (r.ageGroup !== undefined && r.ageGroup !== '') ? r.ageGroup : parsed.ageGroup,
    phone: (r.contactNumber !== undefined && r.contactNumber !== '') ? r.contactNumber : parsed.phone,
    idNumber: (r.idNumber !== undefined && r.idNumber !== '') ? r.idNumber : parsed.idNumber,
    photoUrl: parsed.photoUrl,
  }
  
  return { ...r, data: merged }
}
