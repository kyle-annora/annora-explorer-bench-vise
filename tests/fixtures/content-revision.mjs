import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/** Build-time identity: exact prepared files plus authored view, grouping and tour data.
 * Never imported by the browser. A file or policy change requires an explicit revision update.
 */
export async function contentRevision(model) {
  const descriptors = {};
  const keys = ['metadataUrl', 'modelUrl', 'compressedUrl', 'edgesUrl', 'compressedEdgesUrl', 'edgeMetadataUrl', 'silhouettesUrl', 'compressedSilhouettesUrl', 'silhouetteMetadataUrl', 'licenseUrl'];
  for (const key of keys) if (model[key]) {
    descriptors[key] = createHash('sha256').update(await readFile(model[key])).digest('hex');
  }
  const identity = {
    schema: 'prepared-catalog-v1', packageId: model.packageId, rootId: model.rootId,
    direction: model.defaultDirection, normalizedWidth: model.normalizeWidth,
    presentationPolicy: model.presentationPolicy, sourceUrl: model.sourceUrl,
    tour: model.tour, files: descriptors,
  };
  return 'sha256:' + createHash('sha256').update(JSON.stringify(identity)).digest('hex');
}
