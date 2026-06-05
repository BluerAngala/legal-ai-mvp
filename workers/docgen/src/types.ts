// Template types
export interface TemplateVariable {
	name: string;
	type: "text" | "date" | "number" | "select" | "document_ref";
	label: string;
	required: boolean;
	defaultValue?: string | number;
	options?: { value: string; label: string }[]; // for select type
	description?: string;
}

export interface Template {
	id: string;
	name: string;
	category: "contract" | "letter" | "report" | "brief";
	content: string;
	variables: TemplateVariable[];
	description?: string;
	isPublic: boolean;
	createdBy: string;
	createdAt: Date;
	updatedAt: Date;
}

// Generation types
export interface GenerateRequest {
	templateId: string;
	variables: Record<string, unknown>;
	ownerId?: string;
}

export interface GeneratedDocument {
	id: string;
	templateId: string;
	templateName: string;
	content: string;
	format: "markdown" | "html" | "docx";
	variables: Record<string, unknown>;
	metadata: {
		generatedAt: Date;
		generatedBy: string;
		wordCount: number;
	};
}

// Export types
export type ExportFormat = "markdown" | "html" | "docx";

export interface ExportRequest {
	documentId: string;
	format: ExportFormat;
}

// API types
export interface ListTemplatesRequest {
	category?: Template["category"];
	search?: string;
	limit?: number;
	offset?: number;
}

export interface ListTemplatesResponse {
	templates: Template[];
	total: number;
	limit: number;
	offset: number;
}

// Database row types
export interface TemplateRow {
	id: string;
	name: string;
	category: string;
	content: string;
	variables: TemplateVariable[];
	description: string | null;
	is_public: boolean;
	created_by: string;
	created_at: Date;
	updated_at: Date;
}

export interface GeneratedDocRow {
	id: string;
	template_id: string;
	content: string;
	format: string;
	variables: Record<string, unknown>;
	metadata: Record<string, unknown>;
	owner_id: string;
	created_at: Date;
}
export interface GeneratedDocMetadata {
	generatedAt: string;
	generatedBy: string;
	wordCount: number;
}
