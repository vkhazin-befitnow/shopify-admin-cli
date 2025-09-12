import * as fs from 'fs';
import * as path from 'path';

export function helpCommand(): void {
  try {
    const userGuidePath = path.join(__dirname, '../../docs/user-guide.md');
    const userGuideContent = fs.readFileSync(userGuidePath, 'utf-8');
    console.log(userGuideContent);
  } catch (error) {
    console.error('Error reading user guide:', error);
    console.log('Help information is not available.');
  }
}
