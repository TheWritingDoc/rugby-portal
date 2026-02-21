import fs from 'fs'
import path from 'path'
import prisma from './prisma.js'

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
    
    console.log('Starting migration...')
    
    // Migrate Schools
    if (data.schools && data.schools.length > 0) {
      console.log(`Migrating ${data.schools.length} schools...`)
      for (const item of data.schools) {
        await prisma.school.create({
          data: {
            id: item.id,
            zoneId: item.data.zoneId || '',
            schoolId: item.data.schoolId || '',
            address: item.data.address || null,
            contactNumber: item.data.contactNumber || null,
            email: item.data.email || null,
            data: JSON.stringify(item.data),
            ts: new Date(item.ts)
          }
        })
      }
    }
    
    // Migrate Players
    if (data.players && data.players.length > 0) {
      console.log(`Migrating ${data.players.length} players...`)
      for (const item of data.players) {
        await prisma.player.create({
          data: {
            id: item.id,
            zoneId: item.data.zoneId || '',
            schoolId: item.data.schoolId || '',
            name: item.data.name || '',
            surname: item.data.surname || '',
            idNumber: item.data.idNumber || null,
            dateOfBirth: item.data.dateOfBirth || null,
            gender: item.data.gender || null,
            ageGroup: item.data.ageGroup || null,
            contactNumber: item.data.contactNumber || null,
            email: item.data.email || null,
            parentContact: item.data.parentContact || null,
            parentEmail: item.data.parentEmail || null,
            data: JSON.stringify(item.data),
            ts: new Date(item.ts)
          }
        })
      }
    }
    
    // Migrate Coaches
    if (data.coaches && data.coaches.length > 0) {
      console.log(`Migrating ${data.coaches.length} coaches...`)
      for (const item of data.coaches) {
        await prisma.coach.create({
          data: {
            id: item.id,
            zoneId: item.data.zoneId || '',
            schoolId: item.data.schoolId || '',
            name: item.data.name || '',
            surname: item.data.surname || '',
            idNumber: item.data.idNumber || null,
            contactNumber: item.data.contactNumber || null,
            email: item.data.email || null,
            qualifications: item.data.qualifications || null,
            experience: item.data.experience || null,
            data: JSON.stringify(item.data),
            ts: new Date(item.ts)
          }
        })
      }
    }
    
    // Migrate Referees
    if (data.referees && data.referees.length > 0) {
      console.log(`Migrating ${data.referees.length} referees...`)
      for (const item of data.referees) {
        await prisma.referee.create({
          data: {
            id: item.id,
            name: item.data.name || '',
            surname: item.data.surname || '',
            idNumber: item.data.idNumber || null,
            contactNumber: item.data.contactNumber || null,
            email: item.data.email || null,
            qualifications: item.data.qualifications || null,
            experience: item.data.experience || null,
            data: JSON.stringify(item.data),
            ts: new Date(item.ts)
          }
        })
      }
    }
    
    // Migrate Admins
    if (data.admins && data.admins.length > 0) {
      console.log(`Migrating ${data.admins.length} admins...`)
      for (const item of data.admins) {
        await prisma.admin.create({
          data: {
            id: item.id,
            name: item.data.name || '',
            surname: item.data.surname || '',
            idNumber: item.data.idNumber || null,
            contactNumber: item.data.contactNumber || null,
            email: item.data.email || null,
            role: item.data.role || null,
            zoneId: item.data.zoneId || null,
            schoolId: item.data.schoolId || null,
            data: JSON.stringify(item.data),
            ts: new Date(item.ts)
          }
        })
      }
    }
    
    // Migrate Audits
    if (data.audits && data.audits.length > 0) {
      console.log(`Migrating ${data.audits.length} audits...`)
      for (const item of data.audits) {
        await prisma.audit.create({
          data: {
            id: item.id,
            userRole: item.userRole || '',
            entity: item.entity || '',
            action: item.action || '',
            before: item.before ? JSON.stringify(item.before) : null,
            after: item.after ? JSON.stringify(item.after) : null,
            ts: new Date(item.ts)
          }
        })
      }
    }
    
    // Migrate Documents
    if (data.documents && data.documents.length > 0) {
      console.log(`Migrating ${data.documents.length} documents...`)
      for (const item of data.documents) {
        await prisma.document.create({
          data: {
            id: item.id,
            ownerType: item.ownerType || '',
            ownerId: item.ownerId || '',
            fileName: item.fileName || '',
            fileUrl: item.fileUrl || '',
            status: item.status || 'pending',
            ts: new Date(item.ts)
          }
        })
      }
    }
    
    console.log('Migration completed successfully!')
    
    // Backup the old JSON file
    const backupPath = dbPath + '.backup'
    fs.renameSync(dbPath, backupPath)
    console.log(`Original database backed up to: ${backupPath}`)
    
  } catch (error) {
    console.error('Migration failed:', error)
  } finally {
    await prisma.$disconnect()
  }
}

migrate()