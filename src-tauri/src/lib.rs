mod compiler;
mod db;
mod error;
mod models;
mod runner;

pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
