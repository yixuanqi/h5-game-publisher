use taffy::prelude::*;

fn metrics(width: f32, gap: f32) -> [f32; 4] {
    let mut tree: TaffyTree<()> = TaffyTree::new();
    tree.disable_rounding();

    let child_style = Style {
        min_size: Size { width: length(0.0), height: auto() },
        ..Default::default()
    };
    let a = tree.new_leaf(child_style.clone()).unwrap();
    let b = tree.new_leaf(child_style).unwrap();

    let root = tree.new_with_children(
        Style {
            display: Display::Grid,
            size: Size { width: length(width), height: auto() },
            gap: Size { width: length(gap), height: length(0.0) },
            grid_template_columns: "minmax(0, 1.04fr) minmax(248px, 0.96fr)".parse().unwrap(),
            ..Default::default()
        },
        &[a,b],
    ).unwrap();

    tree.compute_layout(root, Size { width: length(width), height: max_content() }).unwrap();
    let la = *tree.layout(a).unwrap();
    let lb = *tree.layout(b).unwrap();
    [la.size.width, lb.location.x, lb.size.width, tree.layout(root).unwrap().size.width]
}

#[no_mangle]
pub extern "C" fn TaffyTitleGridMetric(width: f32, gap: f32, index: u32) -> f32 {
    let m = metrics(width, gap);
    match index { 0 => m[0], 1 => m[1], 2 => m[2], 3 => m[3], _ => f32::NAN }
}
