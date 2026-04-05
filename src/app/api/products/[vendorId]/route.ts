import { NextRequest, NextResponse } from 'next/server';
import { findAccessoryVendor } from '@/data/accessories';
import { getMergedProducts, getCustomProducts, saveCustomProducts } from '@/lib/products-kv';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ vendorId: string }> }
) {
  const { vendorId } = await params;
  try {
    const vendor = findAccessoryVendor(vendorId);
    if (!vendor) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
    }

    const products = await getMergedProducts(vendorId, vendor.products);
    // Build category list from all products
    const catSet = new Set(vendor.categories);
    products.forEach(p => { if (p.category) catSet.add(p.category); });

    return NextResponse.json({ products, categories: Array.from(catSet) });
  } catch (error) {
    console.error('Failed to fetch products:', error);
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ vendorId: string }> }
) {
  const { vendorId } = await params;
  try {
    const vendor = findAccessoryVendor(vendorId);
    if (!vendor) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
    }

    const body = await request.json();
    const { name, sku, price, category, unit, caseSize } = body;

    if (!name || price == null || !category) {
      return NextResponse.json({ error: 'name, price, and category are required' }, { status: 400 });
    }

    const id = `custom-${vendorId}-${crypto.randomUUID().slice(0, 8)}`;
    const product = {
      id,
      name,
      sku: sku || undefined,
      price: Number(price),
      category,
      unit: unit || undefined,
      caseSize: caseSize ? Number(caseSize) : undefined,
      isCustom: true,
    };

    const custom = await getCustomProducts(vendorId);
    custom.push(product);
    await saveCustomProducts(vendorId, custom);

    return NextResponse.json({ product });
  } catch (error) {
    console.error('Failed to add product:', error);
    return NextResponse.json({ error: 'Failed to add product' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ vendorId: string }> }
) {
  const { vendorId } = await params;
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Product id is required' }, { status: 400 });
    }

    if (!id.startsWith('custom-')) {
      return NextResponse.json({ error: 'Only custom products can be edited' }, { status: 400 });
    }

    const custom = await getCustomProducts(vendorId);
    const idx = custom.findIndex(p => p.id === id);
    if (idx === -1) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Merge updates, converting numeric fields
    if (updates.price != null) updates.price = Number(updates.price);
    if (updates.caseSize != null) updates.caseSize = updates.caseSize ? Number(updates.caseSize) : undefined;

    custom[idx] = { ...custom[idx], ...updates, isCustom: true };
    await saveCustomProducts(vendorId, custom);

    return NextResponse.json({ product: custom[idx] });
  } catch (error) {
    console.error('Failed to update product:', error);
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ vendorId: string }> }
) {
  const { vendorId } = await params;
  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'Product id is required' }, { status: 400 });
    }

    if (!id.startsWith('custom-')) {
      return NextResponse.json({ error: 'Only custom products can be deleted' }, { status: 400 });
    }

    const custom = await getCustomProducts(vendorId);
    const filtered = custom.filter(p => p.id !== id);
    await saveCustomProducts(vendorId, filtered);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete product:', error);
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 });
  }
}
