import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cities, prepare } from '../payroll/miLocalFiling.mjs';

const [command, source, directory, ...extra] = process.argv.slice(2);
try {
  if (command === 'cities' && !source) {
    for (const [name, profile] of Object.entries(cities)) console.log(name, profile.instructions);
  } else if (command === 'prepare' && source && directory && !extra.length) {
    const raw = await readFile(source, 'utf8');
    let input;
    try { input = JSON.parse(raw); } catch { throw new Error('Invalid filing JSON'); }
    const { worksheet, w2 } = prepare(input);
    await mkdir(directory, { mode: 0o700 });
    try {
      const options = { mode: 0o600, flag: 'wx' };
      if (w2) await writeFile(join(directory, w2.filename), w2.content, options);
      await writeFile(join(directory, 'worksheet.json'), JSON.stringify(worksheet, null, 2) + '\n', options);
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
    console.log('Prepared', worksheet.city, worksheet.year, 'filing materials.');
  } else {
    throw new Error('Usage: filing:mi-local cities | prepare INPUT.json NEW_DIRECTORY');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
