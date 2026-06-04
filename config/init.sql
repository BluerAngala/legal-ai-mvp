-- LegalAI MVP - PostgreSQL Schema (No pgvector)
-- For Windows compatibility, using JSONB for embeddings with app-level similarity

-- ============================================
-- 文档表
-- ============================================
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL CHECK (type IN ('contract', 'case', 'regulation', 'brief', 'other')),
    title VARCHAR(500) NOT NULL,
    content TEXT,
    raw_content BYTEA,
    mime_type VARCHAR(100),
    file_size BIGINT,
    metadata JSONB DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'processing' CHECK (status IN ('processing', 'parsed', 'indexed', 'error')),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    indexed_at TIMESTAMP WITH TIME ZONE,
    owner_id VARCHAR(100)
);

CREATE INDEX idx_documents_type ON documents(type);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX idx_documents_tags ON documents USING GIN(tags);

-- ============================================
-- 文档分块表 (embedding as JSONB array)
-- ============================================
CREATE TABLE document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    metadata JSONB DEFAULT '{}',
    embedding JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_chunks_document_id ON document_chunks(document_id);
CREATE INDEX idx_chunks_content ON document_chunks USING GIN(to_tsvector('simple', content));

-- ============================================
-- 知识库集合表
-- ============================================
CREATE TABLE collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    type VARCHAR(50) DEFAULT 'private' CHECK (type IN ('private', 'shared', 'public')),
    owner_id VARCHAR(100) NOT NULL,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_collections_owner ON collections(owner_id);

-- ============================================
-- 集合-文档关联表
-- ============================================
CREATE TABLE collection_documents (
    collection_id UUID REFERENCES collections(id) ON DELETE CASCADE,
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (collection_id, document_id)
);

-- ============================================
-- 分析任务表
-- ============================================
CREATE TABLE analysis_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('risk_review', 'clause_compare', 'summary', 'qa')),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    input_params JSONB DEFAULT '{}',
    result JSONB,
    confidence FLOAT,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    owner_id VARCHAR(100)
);

CREATE INDEX idx_analysis_document ON analysis_tasks(document_id);
CREATE INDEX idx_analysis_type ON analysis_tasks(type);
CREATE INDEX idx_analysis_status ON analysis_tasks(status);

-- ============================================
-- 文档模板表
-- ============================================
CREATE TABLE templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN ('contract', 'letter', 'report', 'brief')),
    content TEXT NOT NULL,
    variables JSONB DEFAULT '[]',
    description TEXT,
    is_public BOOLEAN DEFAULT false,
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_templates_category ON templates(category);

-- ============================================
-- 生成的文档表
-- ============================================
CREATE TABLE generated_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    format VARCHAR(20) NOT NULL CHECK (format IN ('markdown', 'html', 'docx')),
    variables JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    owner_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_generated_template ON generated_documents(template_id);
CREATE INDEX idx_generated_created ON generated_documents(created_at DESC);
CREATE INDEX idx_generated_owner ON generated_documents(owner_id);

-- ============================================
-- 审计日志表
-- ============================================
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(100),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    details JSONB,
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

-- ============================================
-- 全文搜索函数 (不使用 pgvector)
-- ============================================
CREATE OR REPLACE FUNCTION search_chunks_fulltext(
    search_query TEXT,
    match_count INT DEFAULT 10
)
RETURNS TABLE (
    chunk_id UUID,
    document_id UUID,
    content TEXT,
    metadata JSONB,
    rank REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        dc.id,
        dc.document_id,
        dc.content,
        dc.metadata,
        ts_rank(to_tsvector('simple', dc.content), plainto_tsquery('simple', search_query)) AS rank
    FROM document_chunks dc
    WHERE to_tsvector('simple', dc.content) @@ plainto_tsquery('simple', search_query)
    ORDER BY rank DESC
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 自动更新 updated_at 触发器
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_collections_updated_at
    BEFORE UPDATE ON collections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_templates_updated_at
    BEFORE UPDATE ON templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
