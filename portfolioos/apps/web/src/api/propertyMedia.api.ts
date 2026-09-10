import { api, unwrap } from './client';
import type { ApiResponse } from '@portfolioos/shared';
import type { PreparedImage } from '@/lib/imageResize';

export type PropertyOwnerType = 'OWNED_PROPERTY' | 'RENTAL_PROPERTY';

export interface PropertyPhotoDTO {
  id: string;
  ownerType: PropertyOwnerType;
  ownerId: string;
  width: number;
  height: number;
  sizeBytes: number;
  caption: string | null;
  sortOrder: number;
  createdAt: string;
}

/** A property's first photo and how many it has — for list cards. */
export interface PhotoCover {
  coverPhotoId: string;
  count: number;
}

export type LocationSource = 'geocoded' | 'approximate' | 'manual';

export interface PropertyLocationDTO {
  latitude: number | null;
  longitude: number | null;
  source: LocationSource | null;
}

export interface ListedLocationDTO extends PropertyLocationDTO {
  id: string;
  /** Address not looked up yet; ask again shortly. */
  pending: boolean;
}

export const propertyPhotosApi = {
  async list(ownerType: PropertyOwnerType, ownerId: string): Promise<PropertyPhotoDTO[]> {
    const { data } = await api.get<ApiResponse<PropertyPhotoDTO[]>>('/api/property-photos', {
      params: { ownerType, ownerId },
    });
    return unwrap(data);
  },
  async covers(ownerType: PropertyOwnerType): Promise<Record<string, PhotoCover>> {
    const { data } = await api.get<ApiResponse<Record<string, PhotoCover>>>('/api/property-photos/covers', {
      params: { ownerType },
    });
    return unwrap(data);
  },
  async upload(
    ownerType: PropertyOwnerType,
    ownerId: string,
    image: PreparedImage,
    caption?: string,
  ): Promise<PropertyPhotoDTO> {
    const form = new FormData();
    form.append('ownerType', ownerType);
    form.append('ownerId', ownerId);
    form.append('width', String(image.width));
    form.append('height', String(image.height));
    if (caption) form.append('caption', caption);
    form.append('full', image.full, 'photo');
    form.append('thumb', image.thumb, 'thumb');
    const { data } = await api.post<ApiResponse<PropertyPhotoDTO>>('/api/property-photos', form);
    return unwrap(data);
  },
  /** The image bytes, fetched with the user's token (an <img src> can't send it). */
  async image(id: string, size: 'full' | 'thumb'): Promise<Blob> {
    const res = await api.get(`/api/property-photos/${id}/${size}`, { responseType: 'blob' });
    return res.data as Blob;
  },
  async makeCover(id: string): Promise<PropertyPhotoDTO> {
    const { data } = await api.post<ApiResponse<PropertyPhotoDTO>>(`/api/property-photos/${id}/cover`);
    return unwrap(data);
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/api/property-photos/${id}`);
  },
};

export const propertyLocationApi = {
  async list(ownerType: PropertyOwnerType): Promise<ListedLocationDTO[]> {
    const { data } = await api.get<ApiResponse<ListedLocationDTO[]>>('/api/property-location', {
      params: { ownerType },
    });
    return unwrap(data);
  },
  async get(ownerType: PropertyOwnerType, id: string): Promise<PropertyLocationDTO> {
    const { data } = await api.get<ApiResponse<PropertyLocationDTO>>(`/api/property-location/${ownerType}/${id}`);
    return unwrap(data);
  },
  async set(ownerType: PropertyOwnerType, id: string, latitude: number, longitude: number): Promise<PropertyLocationDTO> {
    const { data } = await api.put<ApiResponse<PropertyLocationDTO>>(`/api/property-location/${ownerType}/${id}`, {
      latitude,
      longitude,
    });
    return unwrap(data);
  },
  /** Forget the pin and look the address up again. */
  async reset(ownerType: PropertyOwnerType, id: string): Promise<PropertyLocationDTO> {
    const { data } = await api.delete<ApiResponse<PropertyLocationDTO>>(`/api/property-location/${ownerType}/${id}`);
    return unwrap(data);
  },
};
