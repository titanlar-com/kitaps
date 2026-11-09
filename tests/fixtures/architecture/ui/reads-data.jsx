// A screen that reaches past the facade: the UI gate must report all five.
import catalog from '../../../../src/catalog.json';
import stores from '../../../../data/bookstores.json';
import { GitHubStateRepository } from '../../../../src/state/GitHubStateRepository.ts';
import { newRouteId } from '../../../../src/state/routeRegistry.ts';
import { encodeBase64 } from '../../../../src/state/githubFile.ts';
export const parts = [catalog, stores, GitHubStateRepository, newRouteId, encodeBase64];
