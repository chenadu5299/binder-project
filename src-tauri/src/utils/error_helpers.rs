use rusqlite;

/// 数据库连接错误转换（泛型版本）
pub fn db_lock_error<T>(e: std::sync::PoisonError<T>) -> rusqlite::Error {
    rusqlite::Error::SqliteFailure(
        rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_LOCKED),
        Some(format!("获取数据库连接失败: {}", e))
    )
}

/// 时间错误转换
pub fn time_error(e: std::time::SystemTimeError) -> rusqlite::Error {
    rusqlite::Error::SqliteFailure(
        rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_MISUSE),
        Some(format!("获取时间失败: {}", e))
    )
}

/// JSON 序列化错误转换
pub fn json_serialize_error(e: serde_json::Error) -> rusqlite::Error {
    rusqlite::Error::SqliteFailure(
        rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_MISUSE),
        Some(format!("JSON 序列化失败: {}", e))
    )
}

/// 安全地获取当前时间戳
pub fn get_current_timestamp() -> Result<i64, rusqlite::Error> {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(time_error)
        .map(|d| d.as_secs() as i64)
}

