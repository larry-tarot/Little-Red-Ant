fn main() {
    let cwd = std::env::current_dir().unwrap();
    println!("cargo:warning=build.rs cwd: {:?}", cwd);
    println!("cargo:warning=build.rs manifest_dir: {:?}", std::env::var("CARGO_MANIFEST_DIR"));
    println!("cargo:warning=build.rs OUT_DIR: {:?}", std::env::var("OUT_DIR"));
    tauri_build::build()
}
