import {readFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {matchFile, modelFiles} from './model-files.mjs';

const {models} = JSON.parse(await readFile(new URL('./recommended-models.json', import.meta.url), 'utf8'));

function matchPipeline(model, files) {
  const sentinel = model.files.find(file => file.name === 'model_index.json');
  const candidates = [...(files.get(sentinel.name)?.values() || [])]
    .filter(file => file.bytes === sentinel.size)
    .map(file => dirname(file.path));
  for (const root of candidates) {
    const complete = model.files.every(spec => {
      const relativePath = spec.target.slice(spec.target.indexOf('/') + 1);
      return files.get(spec.name)?.get(join(root, relativePath))?.bytes === spec.size;
    });
    if (complete) return {modelPath: root};
  }
  return null;
}

export async function scanModels(folder) {
  const names = new Set(models.flatMap(model => model.files.map(file => file.name)));
  const {root, files, warnings} = await modelFiles(folder, names);
  const profiles = [];

  for (const model of models) {
    let paths;
    if (model.settings.backend === 'qwen-diffusers') {
      paths = matchPipeline(model, files);
      if (!paths) continue;
    } else {
      const checkpoint = model.files.find(file => file.role === 'modelPath');
      if (!files.has(checkpoint.name)) continue;
      paths = {};
      const issues = [];
      for (const file of model.files) {
        const result = matchFile(files, file);
        if (result.path) paths[file.role] = result.path;
        else issues.push(result.issue);
      }
      if (issues.length) {
        warnings.push(model.name + ' needs ' + issues.join(', ') + '.');
        continue;
      }
    }
    profiles.push({id: model.id, name: model.name, ...model.settings, ...paths, enabled: true});
  }

  for (const profile of profiles) {
    if (profile.backend !== 'comfy-krea') continue;
    const portable = profiles.find(p => p.id === profile.id + '-portable');
    if (portable) profile.portableProfile = portable.id;
  }
  if (!profiles.length) warnings.unshift('No complete supported image model set was found. Scan the parent folder if components are stored separately, or select component files manually.');
  return {root, profiles, warnings};
}
