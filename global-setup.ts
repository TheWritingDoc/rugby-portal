import { FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Global setup for human-like player management testing
 * Prepares test environment, creates test data, and configures test infrastructure
 */
async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting Global Setup for Human-like Player Management Tests');
  
  // Create test results directory structure
  const testResultsDir = 'test-results';
  const subdirs = [
    'screenshots',
    'videos', 
    'traces',
    'reports',
    'test-files',
    'performance-logs'
  ];
  
  // Clean and recreate test results directory
  if (fs.existsSync(testResultsDir)) {
    fs.rmSync(testResultsDir, { recursive: true, force: true });
  }
  
  fs.mkdirSync(testResultsDir, { recursive: true });
  subdirs.forEach(dir => {
    fs.mkdirSync(path.join(testResultsDir, dir), { recursive: true });
  });
  
  // Create test data files
  await createTestDataFiles();
  
  // Generate player profiles for consistent testing
  await generatePlayerProfiles();
  
  // Setup performance monitoring
  await setupPerformanceMonitoring();
  
  // Configure test environment variables
  await configureTestEnvironment();
  
  // Verify test infrastructure
  await verifyTestInfrastructure();
  
  console.log('✅ Global Setup Complete');
}

async function createTestDataFiles() {
  console.log('📁 Creating test data files...');
  
  // Create sample player photos
  const testFilesDir = 'test-results/test-files';
  
  // Create various image formats for testing
  const imageFormats = [
    { name: 'player-photo-1.jpg', type: 'jpeg', size: 'small' },
    { name: 'player-photo-2.png', type: 'png', size: 'medium' },
    { name: 'player-photo-3.gif', type: 'gif', size: 'large' },
    { name: 'invalid-file.txt', type: 'text', size: 'small' },
    { name: 'corrupt-image.jpg', type: 'corrupt', size: 'small' }
  ];
  
  for (const format of imageFormats) {
    const filePath = path.join(testFilesDir, format.name);
    let buffer: Buffer;
    
    switch (format.type) {
      case 'jpeg':
        buffer = createJPEGBuffer(format.size);
        break;
      case 'png':
        buffer = createPNGBuffer(format.size);
        break;
      case 'gif':
        buffer = createGIFBuffer(format.size);
        break;
      case 'text':
        buffer = Buffer.from('This is not a valid image file');
        break;
      case 'corrupt':
        buffer = createCorruptImageBuffer();
        break;
      default:
        buffer = createJPEGBuffer('small');
    }
    
    fs.writeFileSync(filePath, buffer);
    console.log(`  ✓ Created ${format.name} (${format.size}, ${format.type})`);
  }
}

function createJPEGBuffer(size: string): Buffer {
  // Create a minimal valid JPEG file
  const baseJPEG = Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
    0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
    0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
    0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
    0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
    0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
    0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xD9
  ]);
  
  // Add padding based on size
  const padding = size === 'small' ? 0 : size === 'medium' ? 1024 : 4096;
  const paddingBuffer = Buffer.alloc(padding);
  
  return Buffer.concat([baseJPEG, paddingBuffer]);
}

function createPNGBuffer(size: string): Buffer {
  // Create a minimal valid PNG file
  const basePNG = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00, 0x0C,
    0x49, 0x44, 0x41, 0x54, 0x08, 0x99, 0x01, 0x01, 0x00, 0x00, 0x00, 0xFF,
    0xFF, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC, 0x33, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
  ]);
  
  // Add padding based on size
  const padding = size === 'small' ? 0 : size === 'medium' ? 1024 : 4096;
  const paddingBuffer = Buffer.alloc(padding);
  
  return Buffer.concat([basePNG, paddingBuffer]);
}

function createGIFBuffer(size: string): Buffer {
  // Create a minimal valid GIF file
  const baseGIF = Buffer.from([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00,
    0x00, 0xFF, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x21, 0xF9, 0x04, 0x01,
    0x00, 0x00, 0x00, 0x00, 0x2C, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01,
    0x00, 0x00, 0x02, 0x02, 0x04, 0x01, 0x00, 0x3B
  ]);
  
  // Add padding based on size
  const padding = size === 'small' ? 0 : size === 'medium' ? 1024 : 4096;
  const paddingBuffer = Buffer.alloc(padding);
  
  return Buffer.concat([baseGIF, paddingBuffer]);
}

function createCorruptImageBuffer(): Buffer {
  // Create a file that looks like an image but is corrupted
  return Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
    0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF
  ]);
}

async function generatePlayerProfiles() {
  console.log('👥 Generating player profiles for testing...');
  
  const profiles = [
    {
      name: 'Thando',
      surname: 'Mbeki',
      dateOfBirth: '2008-03-15',
      gender: 'Male',
      zone: 'Northern areas',
      school: 'Hillside',
      grade: 'Grade 10',
      parentName: 'Sipho Mbeki',
      parentPhone: '0823456789',
      parentEmail: 'sipho.mbeki@gmail.com'
    },
    {
      name: 'Amara',
      surname: 'Johnson',
      dateOfBirth: '2007-11-22',
      gender: 'Female',
      zone: 'Northern areas',
      school: 'Hillside',
      grade: 'Grade 11',
      parentName: 'Michael Johnson',
      parentPhone: '0824567890',
      parentEmail: 'michael.johnson@gmail.com'
    },
    {
      name: 'Lethabo',
      surname: 'Williams',
      dateOfBirth: '2009-07-08',
      gender: 'Female',
      zone: 'Northern areas',
      school: 'Hillside',
      grade: 'Grade 9',
      parentName: 'Sarah Williams',
      parentPhone: '0825678901',
      parentEmail: 'sarah.williams@gmail.com'
    },
    {
      name: 'Kagiso',
      surname: 'Smith',
      dateOfBirth: '2008-12-03',
      gender: 'Male',
      zone: 'Northern areas',
      school: 'Hillside',
      grade: 'Grade 10',
      parentName: 'David Smith',
      parentPhone: '0826789012',
      parentEmail: 'david.smith@gmail.com'
    },
    {
      name: 'Zara',
      surname: 'Davis',
      dateOfBirth: '2007-05-18',
      gender: 'Female',
      zone: 'Northern areas',
      school: 'Hillside',
      grade: 'Grade 11',
      parentName: 'Patricia Davis',
      parentPhone: '0827890123',
      parentEmail: 'patricia.davis@gmail.com'
    }
  ];
  
  fs.writeFileSync('test-results/test-player-profiles.json', JSON.stringify(profiles, null, 2));
  console.log(`  ✓ Generated ${profiles.length} player profiles`);
}

async function setupPerformanceMonitoring() {
  console.log('📊 Setting up performance monitoring...');
  
  // Create performance monitoring configuration
  const perfConfig = {
    metrics: [
      'pageLoadTime',
      'formFillTime',
      'responseTime',
      'typingSpeed',
      'pauseDuration',
      'correctionRate'
    ],
    thresholds: {
      pageLoadTime: { max: 3000, target: 1000 },
      formFillTime: { max: 10000, target: 5000 },
      responseTime: { max: 2000, target: 500 },
      typingSpeed: { min: 30, max: 200, target: 75 },
      pauseDuration: { min: 100, max: 5000, target: 1000 },
      correctionRate: { min: 0, max: 0.15, target: 0.05 }
    },
    sampling: {
      pageLoad: 1.0,
      formInteraction: 1.0,
      networkRequests: 0.1
    }
  };
  
  fs.writeFileSync('test-results/performance-config.json', JSON.stringify(perfConfig, null, 2));
  console.log('  ✓ Performance monitoring configured');
}

async function configureTestEnvironment() {
  console.log('⚙️  Configuring test environment...');
  
  // Set environment variables for consistent testing
  process.env.TEST_ENV = 'human-like-player-management';
  process.env.PLAYWRIGHT_SLOW_MO = '50';
  process.env.PLAYWRIGHT_HEADLESS = 'false';
  process.env.PLAYWRIGHT_DEVTOOLS = 'false';
  
  // Create environment configuration
  const envConfig = {
    testEnvironment: 'human-like-player-management',
    slowMo: 50,
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
    timezone: 'America/New_York',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    features: {
      screenshots: true,
      videos: true,
      traces: true,
      accessibility: true,
      visualRegression: true
    }
  };
  
  fs.writeFileSync('test-results/test-environment.json', JSON.stringify(envConfig, null, 2));
  console.log('  ✓ Test environment configured');
}

async function verifyTestInfrastructure() {
  console.log('🔍 Verifying test infrastructure...');
  
  // Check if required services are available
  const checks = [
    { name: 'Frontend Server', url: 'http://localhost:5173', type: 'http' },
    { name: 'Backend Server', url: 'http://localhost:4000/api/schools', type: 'api' },
    { name: 'Test Files Directory', path: 'test-results/test-files', type: 'filesystem' }
  ];
  
  for (const check of checks) {
    try {
      if (check.type === 'http' || check.type === 'api') {
        await new Promise((resolve, reject) => {
          const protocol = check.url.startsWith('https') ? https : http;
          const req = protocol.get(check.url, (res) => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
              console.log(`  ✓ ${check.name} is accessible`);
              resolve(true);
            } else {
              console.log(`  ⚠️  ${check.name} returned status ${res.statusCode}`);
              resolve(false);
            }
          });
          
          req.on('error', (err) => {
            console.log(`  ❌ ${check.name} is not accessible: ${err.message}`);
            resolve(false);
          });
          
          req.setTimeout(5000, () => {
            console.log(`  ⏱️  ${check.name} timeout`);
            req.destroy();
            resolve(false);
          });
        });
      } else if (check.type === 'filesystem') {
        if (fs.existsSync(check.path)) {
          console.log(`  ✓ ${check.name} exists`);
        } else {
          console.log(`  ❌ ${check.name} does not exist`);
        }
      }
    } catch (error) {
      console.log(`  ❌ ${check.name} verification failed: ${error}`);
    }
  }
  
  console.log('✅ Test infrastructure verification complete');
}

export default globalSetup;