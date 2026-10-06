/* Tipe data yang dipertukarkan dengan API server. */
export type FieldType = 'text' | 'longtext' | 'richtext' | 'integer' | 'float' | 'boolean' | 'datetime' | 'email' | 'slug' | 'enum' | 'json' | 'media' | 'relation';
export interface FieldDef { name: string; type: FieldType; label?: string; help?: string; required?: boolean; unique?: boolean; min?: number; max?: number; values?: string[]; target?: string }
export interface ContentType { id: string; apiId: string; pluralId: string; displayName: string; fields: FieldDef[] }
export interface Me { id: string; email: string; name: string; role: { id: string; name: string }; permissions: string[] }
export interface MediaItem { id: string; url: string; name: string; mime: string; size: number; alt: string }
export interface Role { id: string; name: string; description: string; isSystem: boolean; permissions: string[] }
