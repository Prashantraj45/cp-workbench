mod ai;
mod commands;
mod compiler;
mod db;
mod error;
mod models;
mod runner;
mod stress;
mod workspace;

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::get_problems,
            commands::get_problem,
            commands::create_blank_problem,
            commands::scaffold_cf_problem,
            commands::set_problem_standard,
            commands::open_problem,
            commands::get_test_cases,
            commands::create_test_case,
            commands::update_test_case,
            commands::delete_test_case,
            commands::run_solution,
            commands::save_code,
            commands::load_code,
            commands::run_stress_test,
            commands::save_stress_file,
            commands::get_setting,
            commands::set_setting,
            commands::get_template,
            commands::ai_review,
            commands::ai_complexity,
            commands::ai_generate_tests,
            commands::ai_optimize,
            commands::stop_process,
            commands::delete_problem,
            commands::rename_problem,
            commands::get_tags,
            commands::create_tag,
            commands::delete_tag,
            commands::get_problem_tags,
            commands::set_problem_tags,
            commands::get_groups,
            commands::create_group,
            commands::delete_group,
            commands::rename_group,
            commands::get_group_members,
            commands::set_group_members,
            commands::get_run_count,
            commands::scaffold_lc_problem,
            commands::scaffold_cses_problem,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
