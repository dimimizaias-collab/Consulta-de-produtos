import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getDirectImageUrl(url: string) {
  if (!url) return '';
  
  // Handle Google Drive links
  if (url.includes('drive.google.com')) {
    let fileId = '';
    
    // Format: https://drive.google.com/file/d/FILE_ID/view?usp=drive_link
    if (url.includes('/file/d/')) {
      fileId = url.split('/file/d/')[1].split('/')[0];
    } 
    // Format: https://drive.google.com/open?id=FILE_ID
    else if (url.includes('?id=')) {
      fileId = url.split('?id=')[1].split('&')[0];
    }
    // Format: https://drive.google.com/uc?id=FILE_ID
    else if (url.includes('uc?id=')) {
      fileId = url.split('uc?id=')[1].split('&')[0];
    }

    if (fileId) {
      return `https://drive.google.com/uc?id=${fileId}`;
    }
  }
  
  return url;
}
