import db from './db-sqlite.js'
import fs from 'fs'
import path from 'path'

const dbPath = path.join(process.cwd(), 'server', 'data', 'db.json')

async function migrate() {
  try {
    // Read existing JSON data
    if (!fs.existsSync(dbPath)) {
      console.log('No existing JSON database found, starting fresh')
      return
    }
    
    const raw = fs.readFileSync(dbPath, 'utf-8')
    const data = JSON.parse(raw)
    
    console.log('Starting migration from JSON to SQLite...')
    
    // Migrate Schools
    if (data.schools && data.schools.length > 0) {
      console.log(`Migrating ${data.schools.length} schools...`)
      for (const item of data.schools) {
        const stmt = db.prepare(`
          INSERT INTO schools (id, zoneId, schoolId, address, contactNumber, email, data, ts)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        stmt.run(
          item.id,
          item.data.zoneId || '',
          item.data.schoolId || '',
          item.data.address || null,
          item.data.contactNumber || null,
          item.data.email || null,
          JSON.stringify(item.data),
          item.ts
        )
        stmt.finalize()
      }
    }
    
    // Migrate Players
    if (data.players && data.players.length > 0) {
      console.log(`Migrating ${data.players.length} players...`)
      for (const item of data.players) {
        const stmt = db.prepare(`
          INSERT INTO players (id, zoneId, schoolId, name, surname, idNumber, dateOfBirth, gender, ageGroup, contactNumber, email, parentContact, parentEmail, data, ts)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        stmt.run(
          item.id,
          item.data.zoneId || '',
          item.data.schoolId || '',
          item.data.name || '',
          item.data.surname || '',
          item.data.idNumber || null,
          item.data.dateOfBirth || null,
          item.data.gender || null,
          item.data.ageGroup || null,
          item.data.contactNumber || null,
          item.data.email || null,
          item.data.parentContact || null,
          item.data.parentEmail || null,
          JSON.stringify(item.data),
          item.ts
        )
        stmt.finalize()
      }
    }
    
    // Migrate Coaches
    if (data.coaches && data.coaches.length > 0) {
      console.log(`Migrating ${data.coaches.length} coaches...`)
      for (const item of data.coaches) {
        const stmt = db.prepare(`
          INSERT INTO coaches (id, zoneId, schoolId, name, surname, idNumber, contactNumber, email, qualifications, experience, data, ts)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        stmt.run(
          item.id,
          item.data.zoneId || '',
          item.data.schoolId || '',
          item.data.name || '',
          item.data.surname || '',
          item.data.idNumber || null,
          item.data.contactNumber || null,
          item.data.email || null,
          item.data.qualifications || null,
          item.data.experience || null,
          JSON.stringify(item.data),
          item.ts
        )
        stmt.finalize()
      }
    }
    
    // Migrate Referees
    if (data.referees && data.referees.length > 0) {
      console.log(`Migrating ${data.referees.length} referees...`)
      for (const item of data.referees) {
        const stmt = db.prepare(`
          INSERT INTO referees (id, name, surname, idNumber, contactNumber, email, qualifications, experience, data, ts)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        stmt.run(
          item.id,
          item.data.name || '',
          item.data.surname || '',
          item.data.idNumber || null,
          item.data.contactNumber || null,
          item.data.email || null,
          item.data.qualifications || null,
          item.data.experience || null,
          JSON.stringify(item.data),
          item.ts
        )
        stmt.finalize()
      }
    }
    
    // Migrate Admins
    if (data.admins && data.admins.length > 0) {
      console.log(`Migrating ${data.admins.length} admins...`)
      for (const item of data.admins) {
        const stmt = db.prepare(`
          INSERT INTO admins (id, name, surname, idNumber, contactNumber, email, role, zoneId, schoolId, data, ts)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        stmt.run(
          item.id,
          item.data.name || '',
          item.data.surname || '',
          item.data.idNumber || null,
          item.data.contactNumber || null,
          item.data.email || null,
          item.data.role || null,
          item.data.zoneId || null,
          item.data.schoolId || null,
          JSON.stringify(item.data),
          item.ts
        )
        stmt.finalize()
      }
    }
    
    // Migrate Audits
    if (data.audits && data.audits.length > 0) {
      console.log(`Migrating ${data.audits.length} audits...`)
      for (const item of data.audits) {
        const stmt = db.prepare(`
          INSERT INTO audits (id, userRole, entity, action, before, after, ts)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        stmt.run(
          item.id,
          item.userRole || '',
          item.entity || '',
          item.action || '',
          item.before ? JSON.stringify(item.before) : null,
          item.after ? JSON.stringify(item.after) : null,
          item.ts
        )
        stmt.finalize()
      }
    }
    
    // Migrate Documents
    if (data.documents && data.documents.length > 0) {
      console.log(`Migrating ${data.documents.length} documents...`)
      for (const item of data.documents) {
        const stmt = db.prepare(`
          INSERT INTO documents (id, ownerType, ownerId, fileName, fileUrl, status, ts)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        stmt.run(
          item.id,
          item.ownerType || '',
          item.ownerId || '',
          item.fileName || '',
          item.fileUrl || '',
          item.status || 'pending',
          item.ts
        )
        stmt.finalize()
      }
    }
    
    console.log('Migration completed successfully!')
    
    // Backup the old JSON file
    const backupPath = dbPath + '.backup'
    fs.renameSync(dbPath, backupPath)
    console.log(`Original database backed up to: ${backupPath}`)
    
  } catch (error) {
    console.error('Migration failed:', error)
  }
}

// Wait for all operations to complete
db.on('trace', (query) => {
  console.log('SQL:', query)
})

migrate()

// Close the database connection when done
setTimeout(() => {
  db.close()
  console.log('Database connection closed')
}, 5000)