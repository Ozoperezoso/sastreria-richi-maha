// Every e2e run starts from the seed data (users alexander, claudia, admin, inactivo; tickets 1 and 2).
import { execSync } from 'node:child_process';

export default function globalSetup() {
  execSync('npx supabase db reset', { stdio: 'ignore' });
}
