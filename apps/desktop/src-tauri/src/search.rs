use rusqlite::Connection;
use std::path::PathBuf;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum SearchError {
    #[error("SQLite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
}

pub struct SearchEngine {
    conn: Connection,
}

impl SearchEngine {
    pub fn new() -> Result<Self, SearchError> {
        let db_path = Self::get_db_path();
        
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        
        let conn = Connection::open(&db_path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL;")?;
        
        Ok(Self { conn })
    }
    
    fn get_db_path() -> PathBuf {
        dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("LegalAI")
            .join("legalai.db")
    }
    
    pub fn new_for_app() -> Result<Self, SearchError> {
        Self::new()
    }
    
    pub fn index_document(&self, id: &str, title: &str, content: &str) -> Result<(), SearchError> {
        self.conn.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(id, title, content)",
            []
        )?;
        
        self.conn.execute(
            "INSERT OR REPLACE INTO search_fts (id, title, content) VALUES (?1, ?2, ?3)",
            rusqlite::params![id, title, content]
        )?;
        
        Ok(())
    }
    
    pub fn delete_document(&self, id: &str) -> Result<(), SearchError> {
        self.conn.execute("DELETE FROM search_fts WHERE id = ?1", rusqlite::params![id])?;
        Ok(())
    }
    
    pub fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchResult>, SearchError> {
        self.conn.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(id, title, content)",
            []
        )?;
        
        let mut stmt = self.conn.prepare(
            "SELECT id, title, snippet(search_fts, 2, '<mark>', '</mark>', '...', 32) as snippet 
             FROM search_fts 
             WHERE search_fts MATCH ?1 
             LIMIT ?2"
        )?;
        
        let rows = stmt.query_map(rusqlite::params![query, limit as i64], |row| {
            Ok(SearchResult {
                id: row.get(0)?,
                title: row.get(1)?,
                snippet: row.get(2)?,
                score: 1.0,
            })
        })?;
        
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }
    
    pub fn get_all(&self, limit: usize) -> Result<Vec<SearchResult>, SearchError> {
        self.conn.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(id, title, content)",
            []
        )?;
        
        let mut stmt = self.conn.prepare(
            "SELECT id, title, snippet(search_fts, 2, '<mark>', '</mark>', '...', 32) as snippet 
             FROM search_fts LIMIT ?1"
        )?;
        
        let rows = stmt.query_map(rusqlite::params![limit as i64], |row| {
            Ok(SearchResult {
                id: row.get(0)?,
                title: row.get(1)?,
                snippet: row.get(2)?,
                score: 1.0,
            })
        })?;
        
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SearchResult {
    pub id: String,
    pub title: String,
    pub snippet: String,
    pub score: f64,
}
