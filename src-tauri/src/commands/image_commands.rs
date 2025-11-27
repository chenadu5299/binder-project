use crate::services::image_service::ImageService;
use std::path::PathBuf;

#[tauri::command]
pub async fn insert_image(
    document_path: String,
    image_source: String,
) -> Result<String, String> {
    let service = ImageService::new();
    let doc_path = PathBuf::from(document_path);
    let img_path = PathBuf::from(image_source);
    
    service.insert_image(&doc_path, &img_path).await
}

#[tauri::command]
pub async fn check_image_exists(
    document_path: String,
    image_path: String,
) -> Result<bool, String> {
    let service = ImageService::new();
    let doc_path = PathBuf::from(document_path);
    
    Ok(service.check_image_exists(&doc_path, &image_path))
}

#[tauri::command]
pub async fn delete_image(
    document_path: String,
    image_path: String,
) -> Result<(), String> {
    let service = ImageService::new();
    let doc_path = PathBuf::from(document_path);
    
    service.delete_image(&doc_path, &image_path).await
}

