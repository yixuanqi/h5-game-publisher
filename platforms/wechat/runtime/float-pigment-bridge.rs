use float_pigment_css::{
    length_num::LengthNum,
    typing::{AlignItems, Display, FlexDirection, JustifyContent},
};
use float_pigment_forest::{ChildOperation, Len, Node, StyleSetter};
use float_pigment_forest::ffi::{
    NodeCalculateLayout, NodeFree, NodeLayoutGetHeight, NodeLayoutGetLeft, NodeLayoutGetTop,
    NodeLayoutGetWidth,
};
use float_pigment_layout::{DefLength, LayoutGridTemplate, LayoutTrackListItem, LayoutTrackSize};

const ABI_VERSION: u32 = 1;

fn length(unit: u32, value: f32) -> Option<DefLength<Len>> {
    match unit {
        0 => Some(DefLength::Auto),
        1 if value.is_finite() => Some(DefLength::Points(Len::from_f32(value))),
        2 if value.is_finite() => Some(DefLength::Percent(value)),
        3 => Some(DefLength::Undefined),
        _ => None,
    }
}

fn track(kind: u32, value: f32) -> Option<LayoutTrackSize<Len>> {
    match kind {
        0 => Some(LayoutTrackSize::Length(DefLength::Auto)),
        1 if value.is_finite() => Some(LayoutTrackSize::Length(DefLength::Points(Len::from_f32(value)))),
        2 if value.is_finite() => Some(LayoutTrackSize::Length(DefLength::Percent(value))),
        3 if value.is_finite() && value >= 0.0 => Some(LayoutTrackSize::Fr(value)),
        4 => Some(LayoutTrackSize::MinContent),
        5 => Some(LayoutTrackSize::MaxContent),
        _ => None,
    }
}

unsafe fn tracks(ptr: *const f32, count: usize) -> Option<Vec<LayoutTrackListItem<Len>>> {
    if ptr.is_null() || count == 0 || count > 4096 {
        return None;
    }
    let raw = core::slice::from_raw_parts(ptr, count.checked_mul(2)?);
    let mut out = Vec::with_capacity(count);
    for pair in raw.chunks_exact(2) {
        let kind = pair[0];
        if !kind.is_finite() || kind.fract() != 0.0 || kind < 0.0 {
            return None;
        }
        out.push(LayoutTrackListItem::TrackSize(track(kind as u32, pair[1])?));
    }
    Some(out)
}

#[no_mangle]
pub extern "C" fn FpAbiVersion() -> u32 { ABI_VERSION }

#[no_mangle]
pub extern "C" fn FpNodeNew() -> *mut Node { Node::new_ptr() }

#[no_mangle]
pub unsafe extern "C" fn FpNodeFree(node: *mut Node) {
    if !node.is_null() { NodeFree(node.cast()); }
}

#[no_mangle]
pub unsafe extern "C" fn FpNodeAppend(parent: *mut Node, child: *mut Node) -> u32 {
    let (Some(parent), false) = (parent.as_ref(), child.is_null()) else { return 0; };
    parent.append_child(child);
    1
}

#[no_mangle]
pub unsafe extern "C" fn FpNodeSetDisplay(node: *mut Node, code: u32) -> u32 {
    let Some(node) = node.as_ref() else { return 0; };
    let value = match code { 0 => Display::None, 1 => Display::Block, 2 => Display::Flex, 3 => Display::Grid, _ => return 0 };
    node.set_display(value); 1
}

#[no_mangle]
pub unsafe extern "C" fn FpNodeSetWidth(node: *mut Node, unit: u32, value: f32) -> u32 {
    let (Some(node), Some(value)) = (node.as_ref(), length(unit, value)) else { return 0; };
    node.set_width(value); 1
}

#[no_mangle]
pub unsafe extern "C" fn FpNodeSetHeight(node: *mut Node, unit: u32, value: f32) -> u32 {
    let (Some(node), Some(value)) = (node.as_ref(), length(unit, value)) else { return 0; };
    node.set_height(value); 1
}

#[no_mangle]
pub unsafe extern "C" fn FpNodeSetGap(node: *mut Node, axis: u32, unit: u32, value: f32) -> u32 {
    let (Some(node), Some(value)) = (node.as_ref(), length(unit, value)) else { return 0; };
    match axis { 0 => node.set_row_gap(value), 1 => node.set_column_gap(value), _ => return 0 }
    1
}

#[no_mangle]
pub unsafe extern "C" fn FpNodeSetFlexDirection(node: *mut Node, code: u32) -> u32 {
    let Some(node) = node.as_ref() else { return 0; };
    let value = match code { 0 => FlexDirection::Row, 1 => FlexDirection::RowReverse, 2 => FlexDirection::Column, 3 => FlexDirection::ColumnReverse, _ => return 0 };
    node.set_flex_direction(value); 1
}

#[no_mangle]
pub unsafe extern "C" fn FpNodeSetJustifyContent(node: *mut Node, code: u32) -> u32 {
    let Some(node) = node.as_ref() else { return 0; };
    let value = match code {
        0 => JustifyContent::Center, 1 => JustifyContent::FlexStart, 2 => JustifyContent::FlexEnd,
        3 => JustifyContent::SpaceBetween, 4 => JustifyContent::SpaceAround, 5 => JustifyContent::SpaceEvenly,
        6 => JustifyContent::Start, 7 => JustifyContent::End, 8 => JustifyContent::Left,
        9 => JustifyContent::Right, 10 => JustifyContent::Stretch, 11 => JustifyContent::Baseline,
        12 => JustifyContent::Normal, _ => return 0,
    };
    node.set_justify_content(value); 1
}

#[no_mangle]
pub unsafe extern "C" fn FpNodeSetAlignItems(node: *mut Node, code: u32) -> u32 {
    let Some(node) = node.as_ref() else { return 0; };
    let value = match code {
        0 => AlignItems::Stretch, 1 => AlignItems::Normal, 2 => AlignItems::Center, 3 => AlignItems::Start,
        4 => AlignItems::End, 5 => AlignItems::FlexStart, 6 => AlignItems::FlexEnd, 7 => AlignItems::SelfStart,
        8 => AlignItems::SelfEnd, 9 => AlignItems::Baseline, _ => return 0,
    };
    node.set_align_items(value); 1
}

#[no_mangle]
pub extern "C" fn FpGridTracksAlloc(len: usize) -> *mut f32 {
    if len == 0 || len > 8192 { return core::ptr::null_mut(); }
    let mut values = vec![0.0f32; len];
    let ptr = values.as_mut_ptr();
    core::mem::forget(values);
    ptr
}

#[no_mangle]
pub unsafe extern "C" fn FpGridTracksFree(ptr: *mut f32, len: usize) {
    if !ptr.is_null() && len > 0 && len <= 8192 { drop(Vec::from_raw_parts(ptr, len, len)); }
}

#[no_mangle]
pub unsafe extern "C" fn FpNodeSetGridTemplateColumns(node: *mut Node, ptr: *const f32, count: usize) -> u32 {
    let (Some(node), Some(tracks)) = (node.as_ref(), tracks(ptr, count)) else { return 0; };
    node.set_grid_template_columns(LayoutGridTemplate::TrackList(tracks)); 1
}

#[no_mangle]
pub unsafe extern "C" fn FpNodeSetGridTemplateRows(node: *mut Node, ptr: *const f32, count: usize) -> u32 {
    let (Some(node), Some(tracks)) = (node.as_ref(), tracks(ptr, count)) else { return 0; };
    node.set_grid_template_rows(LayoutGridTemplate::TrackList(tracks)); 1
}

#[no_mangle]
pub unsafe extern "C" fn FpNodeCalculate(node: *mut Node, width: f32, height: f32, max_width: f32, max_height: f32) -> u32 {
    let available = |v: f32| v.is_finite() || v == f32::INFINITY;
    if node.is_null() || !available(width) || !available(height) || !max_width.is_finite() || !max_height.is_finite() { return 0; }
    // Upstream NodeCalculateLayout intentionally maps non-finite available size to OptionNum::none().
    NodeCalculateLayout(node.cast(), width, height, max_width, max_height); 1
}

#[no_mangle]
pub unsafe extern "C" fn FpNodeLeft(node: *mut Node) -> f32 { if node.is_null() { f32::NAN } else { NodeLayoutGetLeft(node.cast()) } }
#[no_mangle]
pub unsafe extern "C" fn FpNodeTop(node: *mut Node) -> f32 { if node.is_null() { f32::NAN } else { NodeLayoutGetTop(node.cast()) } }
#[no_mangle]
pub unsafe extern "C" fn FpNodeWidth(node: *mut Node) -> f32 { if node.is_null() { f32::NAN } else { NodeLayoutGetWidth(node.cast()) } }
#[no_mangle]
pub unsafe extern "C" fn FpNodeHeight(node: *mut Node) -> f32 { if node.is_null() { f32::NAN } else { NodeLayoutGetHeight(node.cast()) } }
