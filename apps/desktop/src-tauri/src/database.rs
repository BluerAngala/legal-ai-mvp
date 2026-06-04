use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use thiserror::Error;
use uuid::Uuid;
use chrono::Utc;

#[derive(Error, Debug)]
pub enum DatabaseError {
    #[error("SQLite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Document {
    pub id: String,
    pub title: String,
    pub content: String,
    pub content_type: String,
    pub file_size: i64,
    pub metadata: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Template {
    pub id: String,
    pub name: String,
    pub category: String,
    pub description: Option<String>,
    pub content: String,
}

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new() -> Result<Self, DatabaseError> {
        let db_path = Self::get_db_path()?;
        
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        
        let conn = Connection::open(&db_path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
        
        Ok(Self { conn })
    }
    
    fn get_db_path() -> Result<PathBuf, DatabaseError> {
        let app_dir = dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("LegalAI");
        Ok(app_dir.join("legalai.db"))
    }
    
    pub fn init_schema(&self) -> Result<(), DatabaseError> {
        self.conn.execute_batch(r#"
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                content_type TEXT NOT NULL DEFAULT 'text/plain',
                file_size INTEGER NOT NULL DEFAULT 0,
                metadata TEXT DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            
            CREATE TABLE IF NOT EXISTS templates (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT 'general',
                description TEXT,
                content TEXT NOT NULL,
                is_public INTEGER NOT NULL DEFAULT 0,
                created_by TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            
            CREATE TABLE IF NOT EXISTS analysis_tasks (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                analysis_type TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                result TEXT,
                error_message TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                completed_at TEXT,
                FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
            );
            
            CREATE INDEX IF NOT EXISTS idx_documents_title ON documents(title);
            CREATE INDEX IF NOT EXISTS idx_documents_created ON documents(created_at);
            CREATE INDEX IF NOT EXISTS idx_analysis_document ON analysis_tasks(document_id);
            
            CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
                title, content, content='documents', content_rowid='rowid'
            );
            
            CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
                INSERT INTO documents_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
            END;
        "#)?;
        
        self.init_default_templates()?;
        Ok(())
    }
    
    fn init_default_templates(&self) -> Result<(), DatabaseError> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM templates", [], |row| row.get(0)
        )?;
        
        if count == 0 {
            self.conn.execute_batch(r#"
                INSERT INTO templates (id, name, category, description, content) VALUES
                ('tmpl_contract_basic', '基础合同', 'contract', '通用合同模板', 
                 '# 合同\n\n甲方：{{party_a}}\n乙方：{{party_b}}\n\n## 第一条 项目\n{{project_description}}\n\n## 第二条 金额\n合同金额：{{amount}}元'),
                
                ('tmpl_letter_lawyer', '律师函', 'letter', '标准律师函模板',
                 '# 律师函\n\n致：{{recipient}}\n\n{{lawyer_name}} 律师受 {{client_name}} 委托，就下列事项函告：\n\n## 事实陈述\n{{facts}}\n\n## 法律分析\n{{legal_analysis}}\n\n## 要求\n{{demands}}'),
                
                ('tmpl_report_analysis', '法律分析报告', 'report', '合同风险分析报告',
                 '# 法律分析报告\n\n## 基本信息\n- 合同名称：{{contract_name}}\n- 分析日期：{{analysis_date}}\n\n## 风险摘要\n{{risk_summary}}\n\n## 详细分析\n{{detailed_analysis}}\n\n## 建议\n{{recommendations}}');
            "#)?;
        }
        Ok(())
    }
    
    pub fn insert_document(&self, title: &str, content: &str, content_type: &str, file_size: i64) -> Result<String, DatabaseError> {
        let id = Uuid::new_v4().to_string();
        self.conn.execute(
            "INSERT INTO documents (id, title, content, content_type, file_size) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, title, content, content_type, file_size]
        )?;
        Ok(id)
    }
    
    pub fn get_document(&self, id: &str) -> Result<Option<Document>, DatabaseError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, content, content_type, file_size, metadata, created_at FROM documents WHERE id = ?1"
        )?;
        
        let result = stmt.query_row(params![id], |row| {
            Ok(Document {
                id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                content_type: row.get(3)?,
                file_size: row.get(4)?,
                metadata: row.get(5)?,
                created_at: row.get(6)?,
            })
        });
        
        match result {
            Ok(doc) => Ok(Some(doc)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }
    
    pub fn delete_document(&self, id: &str) -> Result<(), DatabaseError> {
        self.conn.execute("DELETE FROM documents WHERE id = ?1", params![id])?;
        Ok(())
    }
    
    pub fn list_documents(&self, limit: usize, offset: usize) -> Result<Vec<Document>, DatabaseError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, content, content_type, file_size, metadata, created_at 
             FROM documents ORDER BY created_at DESC LIMIT ?1 OFFSET ?2"
        )?;
        
        let docs = stmt.query_map(params![limit as i64, offset as i64], |row| {
            Ok(Document {
                id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                content_type: row.get(3)?,
                file_size: row.get(4)?,
                metadata: row.get(5)?,
                created_at: row.get(6)?,
            })
        })?;
        
        docs.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }
    
    pub fn get_template(&self, id: &str) -> Result<Option<Template>, DatabaseError> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, category, description, content FROM templates WHERE id = ?1"
        )?;
        
        let result = stmt.query_row(params![id], |row| {
            Ok(Template {
                id: row.get(0)?,
                name: row.get(1)?,
                category: row.get(2)?,
                description: row.get(3)?,
                content: row.get(4)?,
            })
        });
        
        match result {
            Ok(tmpl) => Ok(Some(tmpl)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }
    
    pub fn list_templates(&self, category: Option<&str>) -> Result<Vec<Template>, DatabaseError> {
        match category {
            Some(cat) => {
                let mut stmt = self.conn.prepare(
                    "SELECT id, name, category, description, content FROM templates WHERE category = ?1 ORDER BY name"
                )?;
                let rows = stmt.query_map(params![cat], |row| {
                    Ok(Template {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        category: row.get(2)?,
                        description: row.get(3)?,
                        content: row.get(4)?,
                    })
                })?;
                rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
            }
            None => {
                let mut stmt = self.conn.prepare(
                    "SELECT id, name, category, description, content FROM templates ORDER BY name"
                )?;
                let rows = stmt.query_map([], |row| {
                    Ok(Template {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        category: row.get(2)?,
                        description: row.get(3)?,
                        content: row.get(4)?,
                    })
                })?;
                rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
            }
        }
    }
    
    pub fn save_analysis(&self, document_id: &str, analysis_type: &str, result: &str) -> Result<(), DatabaseError> {
        let id = Uuid::new_v4().to_string();
        self.conn.execute(
            "INSERT INTO analysis_tasks (id, document_id, analysis_type, status, result, completed_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, document_id, analysis_type, "completed", result, Utc::now().to_rfc3339()]
        )?;
        Ok(())
    }
    
    pub fn full_text_search(&self, query: &str, limit: usize) -> Result<Vec<(String, String, f64)>, DatabaseError> {
        let mut stmt = self.conn.prepare(
            "SELECT d.id, d.title, d.content, bm25(documents_fts) as rank
             FROM documents_fts fts
             JOIN documents d ON fts.rowid = d.rowid
             WHERE documents_fts MATCH ?1
             ORDER BY rank
             LIMIT ?2"
        )?;
        
        let results = stmt.query_map(params![query, limit as i64], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, f64>(3)?))
        })?;
        
        results.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }
}
