// No extra black console window on Windows (release builds)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    whale_lib::run()
}
