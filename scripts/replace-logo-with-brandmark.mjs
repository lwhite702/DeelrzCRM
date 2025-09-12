#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

/**
 * Codemod script to replace Font Awesome pill icons with BrandMark component
 * Usage: node scripts/replace-logo-with-brandmark.mjs [--dry-run]
 */

const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_PATHS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/*.test.*',
  '**/*.spec.*',
  '**/emails/**',
  '**/pdf/**'
];

// Pattern to match pill icon usage
const PILL_ICON_PATTERNS = [
  /<i\s+className="fas fa-pills[^"]*"[^>]*><\/i>/g,
  /<i\s+className="[^"]*fas fa-pills[^"]*"[^>]*><\/i>/g,
  /className="fas fa-pills[^"]*"/g,
  /className="[^"]*fas fa-pills[^"]*"/g
];

// BrandMark import statement
const BRANDMARK_IMPORT = 'import { BrandMark } from "@/branding/BrandMark";';

// Replacement mappings
const REPLACEMENTS = [
  {
    pattern: /<div className="[^"]*bg-primary[^"]*rounded[^"]*"[^>]*>\s*<i className="[^"]*fas fa-pills[^"]*"[^>]*><\/i>\s*<\/div>/g,
    replacement: '<BrandMark variant="icon" size="sm" theme="auto" />'
  },
  {
    pattern: /<i className="fas fa-pills[^"]*"[^>]*><\/i>/g,
    replacement: '<BrandMark variant="icon" size="sm" theme="auto" />'
  }
];

async function findTSXFiles() {
  const files = await glob('client/src/**/*.{tsx,ts}', { 
    ignore: SKIP_PATHS 
  });
  return files.filter(file => !file.includes('.d.ts'));
}

function needsBrandMarkImport(content) {
  return (
    PILL_ICON_PATTERNS.some(pattern => pattern.test(content)) &&
    !content.includes('BrandMark') &&
    !content.includes('@/branding/BrandMark')
  );
}

function addBrandMarkImport(content) {
  // Find existing imports
  const importRegex = /^import\s+.*?from\s+["'][^"']+["'];?\s*$/gm;
  const imports = content.match(importRegex) || [];
  
  if (imports.length === 0) {
    // No imports found, add at the beginning
    return `${BRANDMARK_IMPORT}\n\n${content}`;
  }
  
  // Check if BrandMark import already exists
  if (imports.some(imp => imp.includes('BrandMark'))) {
    return content;
  }
  
  // Add import after last import
  const lastImport = imports[imports.length - 1];
  const lastImportIndex = content.indexOf(lastImport) + lastImport.length;
  
  return content.slice(0, lastImportIndex) + 
         '\n' + BRANDMARK_IMPORT + 
         content.slice(lastImportIndex);
}

function replacePillIcons(content) {
  let modifiedContent = content;
  
  for (const { pattern, replacement } of REPLACEMENTS) {
    modifiedContent = modifiedContent.replace(pattern, replacement);
  }
  
  return modifiedContent;
}

async function processFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    let modifiedContent = content;
    let hasChanges = false;
    
    // Check if file needs BrandMark import
    if (needsBrandMarkImport(content)) {
      modifiedContent = addBrandMarkImport(modifiedContent);
      hasChanges = true;
    }
    
    // Replace pill icons
    const replacedContent = replacePillIcons(modifiedContent);
    if (replacedContent !== modifiedContent) {
      modifiedContent = replacedContent;
      hasChanges = true;
    }
    
    if (hasChanges) {
      if (DRY_RUN) {
        console.log(`[DRY RUN] Would modify: ${filePath}`);
        console.log('Changes:');
        console.log('- Add BrandMark import');
        console.log('- Replace pill icons with BrandMark components');
        console.log('---');
      } else {
        await fs.writeFile(filePath, modifiedContent, 'utf8');
        console.log(`✅ Modified: ${filePath}`);
      }
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🔍 Finding TSX/TS files...');
  const files = await findTSXFiles();
  console.log(`📁 Found ${files.length} files to check`);
  
  if (DRY_RUN) {
    console.log('🧪 Running in DRY RUN mode - no files will be modified');
  }
  
  let modifiedCount = 0;
  
  for (const file of files) {
    const wasModified = await processFile(file);
    if (wasModified) {
      modifiedCount++;
    }
  }
  
  console.log(`\n🎉 Completed! ${modifiedCount} files ${DRY_RUN ? 'would be' : 'were'} modified.`);
  
  if (DRY_RUN && modifiedCount > 0) {
    console.log('\n💡 Run without --dry-run to apply changes');
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

main().catch(console.error);