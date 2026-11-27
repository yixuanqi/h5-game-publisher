//! V1 diagnostic geometry ABI, backed by pinned upstream Taffy. No game selectors.
use std::{cell::RefCell, collections::{BTreeMap, BTreeSet}};
use taffy::prelude::*;
use taffy::style::GridTemplateTracks;

struct Engine {
    tree: TaffyTree<()>, nodes: BTreeMap<u32, NodeId>, next: u32,
    valid: BTreeSet<u32>, input: Vec<u8>,
}
impl Engine {
    fn new() -> Self { let mut tree = TaffyTree::new(); tree.disable_rounding(); Self {tree,nodes:BTreeMap::new(),next:1,valid:BTreeSet::new(),input:Vec::new()} }
    fn id(&self,h:u32)->Option<NodeId>{self.nodes.get(&h).copied()}
    fn handle(&self,n:NodeId)->Option<u32>{self.nodes.iter().find_map(|(h,id)|(*id==n).then_some(*h))}
    fn invalidate(&mut self){self.valid.clear();}
}
thread_local! {static ENGINE:RefCell<Engine>=RefCell::new(Engine::new());}
fn mutate(f:impl FnOnce(&mut Engine)->Option<()>) -> u32 { ENGINE.with(|e| {let mut e=e.borrow_mut(); e.invalidate(); if f(&mut e).is_some(){1}else{0}}) }
#[no_mangle] pub extern "C" fn TlAbiVersion()->u32{1}
#[no_mangle] pub extern "C" fn TlReset()->u32{mutate(|e|{e.tree.clear();e.nodes.clear();e.input.clear();Some(())})}
#[no_mangle] pub extern "C" fn TlNodeNew()->u32{ENGINE.with(|e|{let mut e=e.borrow_mut();e.invalidate();if e.nodes.len()>=8192 || e.next>=i32::MAX as u32{return 0} let style=Style{display:Display::Block,box_sizing:BoxSizing::ContentBox,..Default::default()};let Ok(n)=e.tree.new_leaf(style)else{return 0};let h=e.next;e.next+=1;e.nodes.insert(h,n);h})}
#[no_mangle] pub extern "C" fn TlNodeFree(h:u32)->u32{mutate(|e|{let n=e.id(h)?;if e.tree.parent(n).is_some()||!e.tree.children(n).ok()?.is_empty(){return None}e.tree.remove(n).ok()?;e.nodes.remove(&h);Some(())})}
#[no_mangle] pub extern "C" fn TlAppend(parent:u32,child:u32)->u32{mutate(|e|{let p=e.id(parent)?;let c=e.id(child)?;if e.tree.parent(c).is_some(){return None}let mut at=Some(p);let mut depth=0;while let Some(n)=at{if n==c{return None}depth+=1;if depth>128{return None}at=e.tree.parent(n);}e.tree.add_child(p,c).ok()?;Some(())})}
#[no_mangle] pub extern "C" fn TlDetach(parent:u32,child:u32)->u32{mutate(|e|{let p=e.id(parent)?;let c=e.id(child)?;if e.tree.parent(c)!=Some(p){return None}e.tree.remove_child(p,c).ok()?;Some(())})}
// Input copied by byte, avoiding host pointer ownership and memory-growth issues.
#[no_mangle] pub extern "C" fn TlInputBegin(len:u32)->u32{ENGINE.with(|e|{if len>4096{return 0} e.borrow_mut().input=vec![0;len as usize];1})}
#[no_mangle] pub extern "C" fn TlInputByte(index:u32,value:u32)->u32{ENGINE.with(|e|{let mut e=e.borrow_mut();if value>127{return 0}if let Some(b)=e.input.get_mut(index as usize){*b=value as u8;1}else{0}})}
// Bounded CSS longhands only. Full parse is upstream, not a JS layout approximation.
#[no_mangle] pub extern "C" fn TlSetStyle(h:u32,prop:u32)->u32{mutate(|e|{
    let n=e.id(h)?;let input=std::str::from_utf8(&e.input).ok()?.trim();
    if input.is_empty()||input.contains("calc(")||input.contains("var("){return None}
    let mut s=e.tree.style(n).ok()?.clone();
    macro_rules! parse {($field:expr)=>{{$field=input.parse().ok()?;}}}
    match prop {
        1=>parse!(s.display),2=>parse!(s.size.width),3=>parse!(s.size.height),
        4=>parse!(s.min_size.width),5=>parse!(s.min_size.height),6=>parse!(s.max_size.width),7=>parse!(s.max_size.height),
        8=>parse!(s.gap.width),9=>parse!(s.gap.height),10=>parse!(s.flex_direction),11=>parse!(s.flex_wrap),
        12=>parse!(s.justify_content),13=>parse!(s.align_items),14=>{s.align_self=if input=="auto"{None}else{Some(input.parse().ok()?)};},
        15=>{let x:f32=input.parse().ok()?;if !x.is_finite()||x<0.0{return None}s.flex_grow=x;},
        16=>{let x:f32=input.parse().ok()?;if !x.is_finite()||x<0.0{return None}s.flex_shrink=x;},
        17=>parse!(s.flex_basis),18=>{if input=="none"{s.grid_template_columns.clear();s.grid_template_column_names.clear();}else{let tracks:GridTemplateTracks<_,GridTemplateComponent<_>>=input.parse().ok()?;s.grid_template_columns=tracks.tracks;s.grid_template_column_names=tracks.line_names;}},
        19=>{if input=="none"{s.grid_template_rows.clear();s.grid_template_row_names.clear();}else{let tracks:GridTemplateTracks<_,GridTemplateComponent<_>>=input.parse().ok()?;s.grid_template_rows=tracks.tracks;s.grid_template_row_names=tracks.line_names;}},
        20=>parse!(s.position),21=>parse!(s.inset.top),22=>parse!(s.inset.right),23=>parse!(s.inset.bottom),24=>parse!(s.inset.left),
        25=>parse!(s.padding.top),26=>parse!(s.padding.right),27=>parse!(s.padding.bottom),28=>parse!(s.padding.left),
        29=>parse!(s.margin.top),30=>parse!(s.margin.right),31=>parse!(s.margin.bottom),32=>parse!(s.margin.left),
        33=>parse!(s.border.top),34=>parse!(s.border.right),35=>parse!(s.border.bottom),36=>parse!(s.border.left),
        37=>parse!(s.box_sizing),38=>{if input=="auto"{s.aspect_ratio=None}else{let x:f32=input.parse().ok()?;if !x.is_finite()||x<=0.0{return None}s.aspect_ratio=Some(x);}},
        39=>parse!(s.grid_column.start),40=>parse!(s.grid_column.end),41=>parse!(s.grid_row.start),42=>parse!(s.grid_row.end),
        _=>return None,
    }
    e.tree.set_style(n,s).ok()?;Some(())
})}
#[no_mangle] pub extern "C" fn TlCompute(root:u32,width:f32,height:f32)->u32{mutate(|e|{
    if !width.is_finite()||!height.is_finite()||width<0.0||height<0.0{return None}
    let r=e.id(root)?;if e.tree.parent(r).is_some(){return None}
    let mut pending=vec![(r,0)];let mut valid=BTreeSet::new();while let Some((n,depth))=pending.pop(){if depth>128||!valid.insert(e.handle(n)?){return None}for c in e.tree.children(n).ok()?{pending.push((c,depth+1));}}
    e.tree.compute_layout(r,Size{width:length(width),height:length(height)}).ok()?;
    e.valid=valid;Some(())
})}
#[no_mangle] pub extern "C" fn TlRect(h:u32,field:u32)->f32{ENGINE.with(|e|{let e=e.borrow();if !e.valid.contains(&h){return f32::NAN}let Some(n)=e.id(h)else{return f32::NAN};let Ok(r)=e.tree.layout(n)else{return f32::NAN};match field{0=>r.location.x,1=>r.location.y,2=>r.size.width,3=>r.size.height,_=>f32::NAN}})}
