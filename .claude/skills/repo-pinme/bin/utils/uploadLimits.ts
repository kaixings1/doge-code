import fs from 'fs';
import path from 'path';

const FILE_SIZE_LIMIT = parseInt(process.env.FILE_SIZE_LIMIT || '100', 10) * 1024 * 1024; // MB to bytes
const DIRECTORY_SIZE_LIMIT = parseInt(process.env.DIRECTORY_SIZE_LIMIT || '500', 10) * 1024 * 1024; // MB to bytes

interface FileSizeCheck {
  size: number;
  exceeds: boolean;
  limit: number;
}

interface DirectorySizeCheck {
  size: number;
  limit: number;
  exceeds: boolean;
}

 function checkFileSizeLimit(filePath: string): FileSizeCheck {
  const stats = fs.statSync(filePath);
  return {
    size: stats.size,
    limit: FILE_SIZE_LIMIT,
    exceeds: stats.size > FILE_SIZE_LIMIT
  };
}

 function checkDirectorySizeLimit(directoryPath: string): DirectorySizeCheck {
  const totalSize = calculateDirectorySize(directoryPath);
  return {
    size: totalSize,
    limit: DIRECTORY_SIZE_LIMIT,
    exceeds: totalSize > DIRECTORY_SIZE_LIMIT
  };
}

function calculateDirectorySize(directoryPath: string): number {
  let totalSize = 0;
  const files = fs.readdirSync(directoryPath);
  
  for (const file of files) {
    const filePath = path.join(directoryPath, file);
    const stats = fs.statSync(filePath);
    
    if (stats.isFile()) {
      totalSize += stats.size;
    } else if (stats.isDirectory()) {
      totalSize += calculateDirectorySize(filePath);
    }
  }
  
  return totalSize;
}

 function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' bytes';
  else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  else return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

export { 
  checkFileSizeLimit, 
  checkDirectorySizeLimit,
  calculateDirectorySize,
  formatSize,
  FILE_SIZE_LIMIT,
  DIRECTORY_SIZE_LIMIT
}; 