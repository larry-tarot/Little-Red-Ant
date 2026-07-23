use glob::glob;
fn main() {
    let pattern = "src-tauri/resources/node_modules/lucide-react/**";
    println!("Pattern: {}", pattern);
    for entry in glob(pattern).expect("Failed to read glob pattern") {
        match entry {
            Ok(path) => println!("{:?}", path.display()),
            Err(e) => println!("Error: {}", e),
        }
    }
}
