-- LegalAI MVP - PostgreSQL Schema
-- 配合 pnpm monorepo + 7 个业务 worker

-- ============================================
-- 文档表（upload-worker 写入）
-- ============================================
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id UUID,
    filename VARCHAR(500) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size BIGINT NOT NULL,
    checksum VARCHAR(128),
    status VARCHAR(50) DEFAULT 'stored' CHECK (status IN ('stored', 'indexing', 'indexed', 'error')),
    storage_path TEXT,
    error_message TEXT,
    indexed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_collection_id ON documents(collection_id);
CREATE INDEX idx_documents_created_at ON documents(created_at DESC);

-- ============================================
-- 文档分块表（document-worker 写入，embedding 存 JSONB）
-- ============================================
CREATE TABLE chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    metadata JSONB DEFAULT '{}',
    embedding JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_chunks_document_id ON chunks(document_id);
CREATE INDEX idx_chunks_content ON chunks USING GIN(to_tsvector('simple', content));

-- ============================================
-- 知识库集合
-- ============================================
CREATE TABLE collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    owner_id VARCHAR(100),
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 集合-文档关联
-- ============================================
CREATE TABLE collection_documents (
    collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (collection_id, document_id)
);

-- ============================================
-- LLM 分析任务
-- ============================================
CREATE TABLE analysis_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('summary', 'risk_review', 'clause_compare', 'qa')),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    input JSONB,
    result JSONB,
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_analysis_tasks_document_id ON analysis_tasks(document_id);
CREATE INDEX idx_analysis_tasks_status ON analysis_tasks(status);

-- ============================================
-- 模板表（docgen-worker 使用）
-- ============================================
CREATE TABLE templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN ('contract', 'letter', 'report', 'brief')),
    description TEXT,
    content TEXT NOT NULL,
    variables JSONB DEFAULT '[]',
    is_public BOOLEAN DEFAULT true,
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_templates_category ON templates(category);

-- ============================================
-- 生成的文档
-- ============================================
CREATE TABLE generated_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES templates(id) ON DELETE SET NULL,
    name VARCHAR(200) NOT NULL,
    format VARCHAR(20) DEFAULT 'markdown' CHECK (format IN ('markdown', 'html', 'docx')),
    content TEXT NOT NULL,
    variables JSONB,
    metadata JSONB DEFAULT '{}',
    created_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_generated_documents_template_id ON generated_documents(template_id);

-- ============================================
-- 审计日志
-- ============================================
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(100),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(100),
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ============================================
-- 法条表（28 条预置法条 + LLM 引证对照）
-- ============================================
CREATE TABLE legal_articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(100) NOT NULL,
    article VARCHAR(50) NOT NULL,
    category VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    keywords TEXT[] DEFAULT '{}',
    jurisdiction VARCHAR(10) DEFAULT 'CN',
    effective_date DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_articles_code ON legal_articles(code);
CREATE INDEX idx_articles_category ON legal_articles(category);
CREATE INDEX idx_articles_keywords ON legal_articles USING GIN(keywords);
CREATE UNIQUE INDEX idx_articles_unique ON legal_articles(code, article);

-- ============================================
-- 风险关键词表（analysis-worker 检测用）
-- ============================================
CREATE TABLE risk_keywords (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(50) NOT NULL,
    keyword VARCHAR(200) NOT NULL,
    level VARCHAR(10) NOT NULL,
    description TEXT,
    suggestion TEXT,
    domain VARCHAR(50) DEFAULT 'contract',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_risk_kw_category ON risk_keywords(category);
CREATE INDEX idx_risk_kw_level ON risk_keywords(level);
CREATE UNIQUE INDEX idx_risk_kw_unique ON risk_keywords(category, keyword);
