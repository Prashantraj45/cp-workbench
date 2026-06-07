mod ai;
mod compiler;
mod db;
mod error;
mod models;
mod runner;
mod stress;
mod workspace;

pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
