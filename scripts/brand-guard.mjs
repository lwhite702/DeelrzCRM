#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

/**
 * Brand Guard script to check for brand consistency and prohibited usage
 * Usage: node scripts/brand-guard.mjs [--fix]
 */

const FIX_MODE = process.argv.includes('--fix');
const SKIP_PATHS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/*.test.*',
  '**/*.spec.*',
  '**/scripts/**'
];

// Brand consistency rules
const BRAND_RULES = [
  {
    name: 'No pill icons',
    pattern: /fas fa-pills|fa-pills/g,
    severity: 'error',
    message: 'Use BrandMark component instead of pill icons',
    allowedPaths: []
  },
  {
    name: 'No PharmaCare references',
    pattern: /PharmaCare|pharmacare|PHARMACARE/g,
    severity: 'error',
    message: 'Use "DeelRxCRM" instead of "PharmaCare"',
    allowedPaths: []
  },
  {
    name: 'No hardcoded brand colors',
    pattern: /#3B82F6|#2563EB|rgb\(59,\s*130,\s*246\)/g,
    severity: 'warning',
    message: 'Use CSS custom properties or BRAND.colors instead of hardcoded colors',
    allowedPaths: ['**/index.css', '**/branding.ts']
  },
  {
    name: 'Consistent logo imports',
    pattern: /import.*["'][^"']*logo[^"']*\.(?:png|jpg|jpeg|svg)["']/g,
    severity: 'error',
    message: 'Use BrandMark component instead of direct logo imports',
    allowedPaths: ['**/branding/**']
  },
  {
    name: 'Brand name consistency',
    pattern: /Pharmacy|pharmacy|PHARMACY/g,
    severity: 'warning',
    message: 'Consider using "Business" or "CRM" terminology instead of pharmacy-specific terms',
    allowedPaths: ['**/storage.ts'] // Allow in legacy documentation
  }
];

class BrandChecker {
  constructor() {
    this.violations = [];
    this.files = [];
  }

  async findFiles() {
    const patterns = [
      'client/src/**/*.{tsx,ts,css,scss}',
      'server/**/*.{ts,js}',
      'shared/**/*.ts',
      '*.{json,md,yml,yaml}'
    ];
    
    const allFiles = [];
    for (const pattern of patterns) {
      const files = await glob(pattern, { ignore: SKIP_PATHS });
      allFiles.push(...files);
    }
    
    this.files = [...new Set(allFiles)]; // Remove duplicates
    return this.files;
  }

  isPathAllowed(filePath, allowedPaths) {
    if (allowedPaths.length === 0) return false;
    
    return allowedPaths.some(pattern => {
      const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
      return regex.test(filePath);
    });
  }

  async checkFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const fileViolations = [];

      for (const rule of BRAND_RULES) {
        if (this.isPathAllowed(filePath, rule.allowedPaths)) {
          continue; // Skip this rule for allowed paths
        }

        const matches = content.match(rule.pattern);
        if (matches) {
          for (const match of matches) {
            // Find line number
            const lines = content.substring(0, content.indexOf(match)).split('\n');
            const lineNumber = lines.length;
            const column = lines[lines.length - 1].length + 1;

            fileViolations.push({
              rule: rule.name,
              severity: rule.severity,
              message: rule.message,
              file: filePath,
              line: lineNumber,
              column: column,
              text: match.trim(),
              pattern: rule.pattern
            });
          }
        }
      }

      return fileViolations;
    } catch (error) {
      console.error(`❌ Error reading ${filePath}:`, error.message);
      return [];
    }
  }

  async checkBrandConfiguration() {
    const configViolations = [];
    
    try {
      // Check if branding config exists
      const brandingConfigPath = 'client/src/branding/branding.ts';
      await fs.access(brandingConfigPath);
      
      // Check if BrandMark component exists
      const brandMarkPath = 'client/src/branding/BrandMark.tsx';
      await fs.access(brandMarkPath);
      
      // Check if logo assets exist
      const logoAssets = [
        'public/branding/deelzrxcrm-logo-light.svg',
        'public/branding/deelzrxcrm-logo-dark.svg',
        'public/branding/favicon.svg'
      ];
      
      for (const asset of logoAssets) {
        try {
          await fs.access(asset);
        } catch {
          configViolations.push({
            rule: 'Missing brand assets',
            severity: 'error',
            message: `Brand asset missing: ${asset}`,
            file: asset,
            line: 0,
            column: 0,
            text: '',
            pattern: null
          });
        }
      }
      
    } catch (error) {
      configViolations.push({
        rule: 'Missing brand configuration',
        severity: 'error',
        message: 'Brand configuration files are missing',
        file: 'client/src/branding/',
        line: 0,
        column: 0,
        text: '',
        pattern: null
      });
    }
    
    return configViolations;
  }

  async run() {
    console.log('🛡️  Running Brand Guard...');
    
    // Check brand configuration
    const configViolations = await this.checkBrandConfiguration();
    this.violations.push(...configViolations);
    
    // Find and check files
    console.log('🔍 Finding files...');
    await this.findFiles();
    console.log(`📁 Checking ${this.files.length} files`);
    
    for (const file of this.files) {
      const fileViolations = await this.checkFile(file);
      this.violations.push(...fileViolations);
    }
    
    this.generateReport();
    
    if (this.violations.length > 0) {
      process.exit(1); // Exit with error code if violations found
    }
  }

  generateReport() {
    const errors = this.violations.filter(v => v.severity === 'error');
    const warnings = this.violations.filter(v => v.severity === 'warning');
    
    console.log('\n📊 Brand Guard Report');
    console.log('═'.repeat(50));
    
    if (this.violations.length === 0) {
      console.log('✅ No brand violations found! Your codebase is brand-compliant.');
      return;
    }
    
    console.log(`❌ ${errors.length} errors, ⚠️  ${warnings.length} warnings\n`);
    
    // Group violations by file
    const violationsByFile = {};
    for (const violation of this.violations) {
      if (!violationsByFile[violation.file]) {
        violationsByFile[violation.file] = [];
      }
      violationsByFile[violation.file].push(violation);
    }
    
    for (const [file, violations] of Object.entries(violationsByFile)) {
      console.log(`📄 ${file}`);
      for (const violation of violations) {
        const icon = violation.severity === 'error' ? '❌' : '⚠️ ';
        const location = violation.line > 0 ? `:${violation.line}:${violation.column}` : '';
        console.log(`  ${icon} ${violation.rule}${location}`);
        console.log(`     ${violation.message}`);
        if (violation.text) {
          console.log(`     Found: "${violation.text}"`);
        }
        console.log();
      }
    }
    
    console.log('💡 Tips:');
    console.log('- Use BrandMark component for all logo/icon usage');
    console.log('- Replace "PharmaCare" with "DeelRxCRM" in all text');
    console.log('- Use CSS custom properties for brand colors');
    console.log('- Run with --fix flag to auto-fix some issues');
    
    if (FIX_MODE) {
      console.log('\n🔧 Auto-fix mode is not implemented yet');
      console.log('Please fix violations manually or use the codemod script');
    }
  }
}

async function main() {
  const checker = new BrandChecker();
  await checker.run();
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

main().catch(console.error);