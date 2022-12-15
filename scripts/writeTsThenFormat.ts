import { spawnSync } from 'child_process';

import fs from 'fs';

export async function writeTsThenFormat(filename: string, content: string) {
    await fs.promises.writeFile(filename, content);
    spawnSync('yarn', ['prettier', '--write', filename], { shell: true, stdio: 'inherit' });
}

