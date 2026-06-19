/**
 * Project catalog types for Catalog Navigator landing and new-project form.
 */

export type ProjectStatus = 'draft' | 'active';

export type ProjectLanguage = 'it' | 'en';

export interface ProjectInfo {
  name: string;
  client: string;
  industry: string;
  industryCustom: string;
  versionMajor: number;
  versionMinor: number;
  versionQualifier: string;
  language: ProjectLanguage;
  ownerCompany: string;
  ownerClient: string;
  description: string;
}

export interface ProjectCatalogRow {
  id: string;
  name: string;
  description: string | null;
  client: string | null;
  industry: string | null;
  industryCustom: string | null;
  versionMajor: number;
  versionMinor: number;
  versionQualifier: string;
  language: ProjectLanguage;
  ownerCompany: string | null;
  ownerClient: string | null;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  documentId: string | null;
  documentName: string | null;
}

export const DEFAULT_PROJECT_INFO: ProjectInfo = {
  name: '',
  client: '',
  industry: 'healthcare',
  industryCustom: '',
  versionMajor: 1,
  versionMinor: 0,
  versionQualifier: 'alpha',
  language: 'it',
  ownerCompany: '',
  ownerClient: '',
  description: '',
};

export const PROJECT_LANGUAGES: Array<{ id: ProjectLanguage; label: string }> = [
  { id: 'it', label: 'Italiano' },
  { id: 'en', label: 'English' },
];

export const VERSION_QUALIFIERS = ['alpha', 'beta', 'rc', ''] as const;
