// Module schema-view stubs. Each module registers its i18n namespace and a
// placeholder view here; full screens arrive in later steps.

import type { ModuleManifest } from '@/core/registry';

export interface ModuleView {
  manifest: ModuleManifest;
  Component: React.ComponentType;
}

import { ModuleStub } from './ModuleStub';
import { MODULE_MANIFESTS } from '@/core/registry';

export const MODULE_VIEWS: ModuleView[] = MODULE_MANIFESTS.map((manifest) => ({
  manifest,
  Component: () => <ModuleStub nameKey={manifest.nameKey} />,
}));
